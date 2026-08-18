import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';

class SubscribeDto {
  @IsString()
  planKey!: string;
}

class BuyCreditsDto {
  @IsIn(['pack_100', 'pack_500', 'pack_2000'])
  packKey!: 'pack_100' | 'pack_500' | 'pack_2000';
}

@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public: plan catalog for the pricing page. */
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  summary(@CurrentUser() user: AuthUser) {
    return this.billing.summary(user.id);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  invoices(@CurrentUser() user: AuthUser) {
    return this.billing.listInvoices(user.id);
  }

  @Post('checkout/subscription')
  @UseGuards(JwtAuthGuard)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.billing.startSubscriptionCheckout(user.id, dto.planKey);
  }

  @Post('checkout/credits')
  @UseGuards(JwtAuthGuard)
  buyCredits(@CurrentUser() user: AuthUser, @Body() dto: BuyCreditsDto) {
    return this.billing.startCreditCheckout(user.id, dto.packKey);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@CurrentUser() user: AuthUser) {
    return this.billing.openPortal(user.id);
  }
}
