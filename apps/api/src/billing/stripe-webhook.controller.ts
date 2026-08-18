import { Controller, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode, VeyraError } from '@veyra/types';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment/payment-provider';

/**
 * Inbound payment-provider webhooks. Authenticated by signature verification
 * (never a shared URL secret alone), idempotent (dedup by event id), and
 * logged. Requires the raw request body — enabled via `rawBody: true` in
 * main.ts (spec §30, §32).
 */
@Controller({ path: 'billing/webhook', version: '1' })
export class StripeWebhookController {
  constructor(
    private readonly billing: BillingService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!this.payments.enabled) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Payments are not enabled');
    }
    const raw = req.rawBody;
    if (!raw || !signature) {
      throw new VeyraError(ErrorCode.INVALID_INPUT, 'Missing webhook body or signature');
    }
    // Throws UNAUTHORIZED on bad signature; the filter maps it to 401.
    const event = this.payments.verifyAndParse(raw, signature);
    const result = await this.billing.applyEvent(event);
    return { received: true, processed: result.processed };
  }
}
