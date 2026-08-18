import { ErrorCode, VeyraError } from '@veyra/types';
import type { CheckoutInput, NormalizedBillingEvent, PaymentProvider } from './payment-provider';

/**
 * Inert provider used when no payment gateway is configured (dev). Checkout and
 * portal are unavailable; webhook verification rejects everything. Billing read
 * APIs and the credit ledger still work.
 */
export class NullPaymentProvider implements PaymentProvider {
  readonly id = 'null';
  readonly enabled = false;

  async ensureCustomer(): Promise<string> {
    throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'No payment provider configured');
  }

  async createCheckoutSession(_input: CheckoutInput): Promise<{ url: string; externalId: string }> {
    throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Payments are not enabled');
  }

  async createPortalSession(): Promise<{ url: string }> {
    throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Payments are not enabled');
  }

  verifyAndParse(): NormalizedBillingEvent {
    throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Payments are not enabled');
  }
}
