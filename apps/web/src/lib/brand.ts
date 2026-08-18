/** Branding is env-driven so the product name can change without code edits. */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'VEYRA 3D',
  tagline: 'Create production 3D with AI',
};
