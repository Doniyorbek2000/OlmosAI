import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AuthService, type AuthTokens } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_COOKIE = 'veyra_access';
const REFRESH_COOKIE = 'veyra_refresh';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.register(dto.email, dto.password, dto.displayName, this.meta(req));
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.password, this.meta(req));
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async resendVerification(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } });
    if (record && !record.emailVerified) await this.auth.sendEmailVerification(user.id, record.email);
    return { ok: true };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    // Always ok — never reveal whether the account exists.
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.resetPassword(dto.token, dto.password);
    this.clearCookies(res);
    return { ok: true };
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.deleteAccount(user.id);
    this.clearCookies(res);
    return { ok: true };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    if (!raw) throw new VeyraError(ErrorCode.UNAUTHORIZED, 'No refresh token');
    const tokens = await this.auth.refresh(raw, this.meta(req));
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    if (raw) await this.auth.logout(raw);
    this.clearCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    this.clearCookies(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        creditBalance: { select: { balance: true, reserved: true } },
        subscription: { select: { status: true, plan: { select: { key: true, name: true } } } },
      },
    });
    if (!record) throw new VeyraError(ErrorCode.NOT_FOUND, 'User not found');
    return record;
  }

  private meta(req: Request) {
    return { userAgent: req.header('user-agent'), ip: req.ip };
  }

  private setCookies(res: Response, tokens: AuthTokens): void {
    const secure = this.config.env.AUTH_COOKIE_SECURE;
    const domain = this.config.env.AUTH_COOKIE_DOMAIN;
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      maxAge: tokens.accessTtl * 1000,
      path: '/',
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      maxAge: tokens.refreshTtl * 1000,
      path: '/',
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }
}
