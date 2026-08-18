/**
 * Credit top-up packs. Amounts + display live here (single source of truth,
 * spec §29); the Stripe price id is injected from env so packs are configurable
 * per environment without code changes.
 */
export interface CreditPack {
  key: string;
  name: string;
  credits: number;
  priceCents: number;
  stripePriceEnv: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { key: 'pack_100', name: '100 credits', credits: 100, priceCents: 900, stripePriceEnv: 'STRIPE_PRICE_PACK_100' },
  { key: 'pack_500', name: '500 credits', credits: 500, priceCents: 3900, stripePriceEnv: 'STRIPE_PRICE_PACK_500' },
  { key: 'pack_2000', name: '2000 credits', credits: 2000, priceCents: 12900, stripePriceEnv: 'STRIPE_PRICE_PACK_2000' },
];

export function findCreditPack(key: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.key === key);
}
