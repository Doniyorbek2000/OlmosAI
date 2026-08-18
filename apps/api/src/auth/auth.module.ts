import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { VerificationService } from './verification.service';
import { MailService } from './mail.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, AuthRateLimitGuard, VerificationService, MailService],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
