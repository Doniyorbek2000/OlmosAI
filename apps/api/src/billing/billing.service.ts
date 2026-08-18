import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { CreditsService } from './credits.service';
import { CREDIT_PACKS, findCreditPack } from './billing.config';
import { PAYMENT_PROVIDER, type NormalizedBillingEvent, type PaymentProvider } from './payment/payment-provider';

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly config: AppConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  // ---- Reads --------------------------------------------------------------

  async summary(userId: string) {
    const [balance, subscription, txns] = await Promise.all([
      this.credits.getBalance(userId),
      this.prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      }),
      this.prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);
    return {
      balance,
      subscription,
      recentTransactions: txns,
      paymentsEnabled: this.payments.enabled,
      creditPacks: CREDIT_PACKS.map((p) => ({ key: p.key, name: p.name, credits: p.credits, priceCents: p.priceCents })),
    };
  }

  listInvoices(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  listPlans() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  }

  // ---- Checkout / portal --------------------------------------------------

  async startSubscriptionCheckout(userId: string, planKey: string) {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.active) throw new VeyraError(ErrorCode.NOT_FOUND, 'Plan not found');
    if (!plan.stripePriceId) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, `Plan ${planKey} has no configured price`);
    }
    const customerId = await this.customerFor(userId);
    const session = await this.payments.createCheckoutSession({
      userId,
      email: await this.emailFor(userId),
      mode: 'subscription',
      priceId: plan.stripePriceId,
      customerId,
      successUrl: `${this.config.env.WEB_URL}/billing?status=success`,
      cancelUrl: `${this.config.env.WEB_URL}/billing?status=cancel`,
      metadata: { userId, kind: 'subscription', planKey },
    });
    return { url: session.url };
  }

  async startCreditCheckout(userId: string, packKey: string) {
    const pack = findCreditPack(packKey);
    if (!pack) throw new VeyraError(ErrorCode.NOT_FOUND, 'Credit pack not found');
    const priceId = process.env[pack.stripePriceEnv];
    if (!priceId) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, `Pack ${packKey} has no configured price`);
    }
    const customerId = await this.customerFor(userId);
    const session = await this.payments.createCheckoutSession({
      userId,
      email: await this.emailFor(userId),
      mode: 'payment',
      priceId,
      customerId,
      successUrl: `${this.config.env.WEB_URL}/billing?status=success`,
      cancelUrl: `${this.config.env.WEB_URL}/billing?status=cancel`,
      metadata: { userId, kind: 'credits', packKey, credits: String(pack.credits) },
    });
    return { url: session.url };
  }

  async openPortal(userId: string) {
    const customerId = await this.customerFor(userId);
    return this.payments.createPortalSession(customerId, `${this.config.env.WEB_URL}/billing`);
  }

  // ---- Event application (idempotent) -------------------------------------

  /**
   * Apply a normalized billing event. Idempotent: a (provider, eventId) is
   * processed at most once, and every credit grant carries the event id as its
   * ledger key. Returns whether the event caused a state change.
   */
  async applyEvent(event: NormalizedBillingEvent): Promise<{ processed: boolean }> {
    // Idempotency gate — insert the marker; a duplicate delivery conflicts.
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { provider: this.payments.id, eventId: event.id, type: event.rawType },
      });
    } catch {
      this.logger.log(`Duplicate webhook ${event.id} ignored`);
      return { processed: false };
    }

    switch (event.type) {
      case 'credits.purchased':
        await this.handleCreditsPurchased(event);
        break;
      case 'subscription.activated':
        await this.handleSubscriptionActivated(event);
        break;
      case 'subscription.renewed':
        await this.handleSubscriptionRenewed(event);
        break;
      case 'subscription.updated':
        await this.handleSubscriptionUpdated(event);
        break;
      case 'subscription.canceled':
        await this.handleSubscriptionCanceled(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.rawType}`);
        return { processed: false };
    }
    return { processed: true };
  }

  private async handleCreditsPurchased(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    if (!userId || !event.creditsToGrant) return;
    await this.credits.grant(userId, event.creditsToGrant, `Credit pack ${event.packKey ?? ''}`.trim(), `stripe:${event.id}`);
    await this.recordPayment(userId, event, 'SUCCEEDED');
  }

  private async handleSubscriptionActivated(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    if (!userId) return;
    if (event.externalCustomerId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: event.externalCustomerId },
      }).catch(() => undefined);
    }
    const plan = await this.resolvePlan(event);
    if (!plan) return;
    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        externalId: event.externalSubscriptionId,
        provider: this.payments.id,
      },
      create: {
        userId,
        planId: plan.id,
        status: 'ACTIVE',
        externalId: event.externalSubscriptionId,
        provider: this.payments.id,
      },
    });
  }

  private async handleSubscriptionRenewed(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    const plan = await this.resolvePlan(event);
    if (!userId || !plan) return;
    // Grant the plan's monthly credits, idempotent on this invoice event.
    if (plan.monthlyCredits > 0) {
      await this.credits.grant(userId, plan.monthlyCredits, `${plan.name} renewal`, `stripe:${event.id}`);
    }
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        planId: plan.id,
        status: 'ACTIVE',
        externalId: event.externalSubscriptionId ?? undefined,
        currentPeriodStart: event.periodStart,
        currentPeriodEnd: event.periodEnd,
      },
    });
    await this.recordPayment(userId, event, 'SUCCEEDED');
  }

  private async handleSubscriptionUpdated(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    if (!userId) return;
    const plan = await this.resolvePlan(event);
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        ...(plan ? { planId: plan.id } : {}),
        status: mapSubStatus(event.subscriptionStatus),
        currentPeriodStart: event.periodStart,
        currentPeriodEnd: event.periodEnd,
      },
    });
  }

  private async handleSubscriptionCanceled(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    if (!userId) return;
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: { status: 'CANCELED', cancelAtPeriodEnd: true },
    });
  }

  private async handlePaymentFailed(event: NormalizedBillingEvent): Promise<void> {
    const userId = await this.resolveUserId(event);
    if (!userId) return;
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: { status: 'PAST_DUE' },
    });
  }

  // ---- Helpers ------------------------------------------------------------

  private async recordPayment(
    userId: string,
    event: NormalizedBillingEvent,
    status: 'SUCCEEDED' | 'FAILED',
  ): Promise<void> {
    try {
      await this.prisma.payment.create({
        data: {
          userId,
          provider: this.payments.id,
          externalId: event.externalPaymentId,
          eventId: event.id,
          amountCents: event.amountCents ?? 0,
          currency: event.currency ?? 'usd',
          status,
        },
      });
    } catch {
      // Unique (eventId/externalId) — already recorded; safe to ignore.
    }
  }

  private async resolveUserId(event: NormalizedBillingEvent): Promise<string | null> {
    if (event.userId) return event.userId;
    if (event.externalCustomerId) {
      const user = await this.prisma.user.findUnique({
        where: { stripeCustomerId: event.externalCustomerId },
        select: { id: true },
      });
      if (user) return user.id;
    }
    if (event.externalSubscriptionId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { externalId: event.externalSubscriptionId },
        select: { userId: true },
      });
      if (sub) return sub.userId;
    }
    this.logger.warn(`Could not resolve user for event ${event.id}`);
    return null;
  }

  private async resolvePlan(event: NormalizedBillingEvent) {
    if (event.planKey) {
      const byKey = await this.prisma.plan.findUnique({ where: { key: event.planKey } });
      if (byKey) return byKey;
    }
    if (event.externalPriceId) {
      const byPrice = await this.prisma.plan.findUnique({
        where: { stripePriceId: event.externalPriceId },
      });
      if (byPrice) return byPrice;
    }
    return null;
  }

  private async customerFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true },
    });
    if (!user) throw new VeyraError(ErrorCode.NOT_FOUND, 'User not found');
    const customerId = await this.payments.ensureCustomer(userId, user.email, user.stripeCustomerId ?? undefined);
    if (customerId !== user.stripeCustomerId) {
      await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    }
    return customerId;
  }

  private async emailFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? '';
  }
}

function mapSubStatus(status?: string): 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'INCOMPLETE';
  }
}
