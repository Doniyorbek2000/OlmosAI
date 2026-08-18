import { Global, Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { BillingService } from './billing.service';
import { BillingAdminService } from './billing-admin.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { AppConfigService } from '../config/config.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment/payment-provider';
import { StripePaymentProvider } from './payment/stripe.provider';
import { NullPaymentProvider } from './payment/null.provider';

@Global()
@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [
    CreditsService,
    BillingService,
    BillingAdminService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PaymentProvider => {
        const key = config.env.STRIPE_SECRET_KEY;
        const secret = config.env.STRIPE_WEBHOOK_SECRET;
        if (key && secret) {
          return new StripePaymentProvider(key, secret);
        }
        return new NullPaymentProvider();
      },
    },
  ],
  exports: [CreditsService, BillingService, BillingAdminService, PAYMENT_PROVIDER],
})
export class BillingModule {}
