/**
 * Idempotent seed: subscription plans, AI providers, and baseline system
 * settings. Safe to run repeatedly (uses upsert). Business pricing lives here
 * and in Plan rows — never hardcoded across the UI (spec §29).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  {
    key: 'FREE',
    name: 'Free',
    priceCentsMonthly: 0,
    monthlyCredits: 30,
    storageGb: 1,
    parallelGenerations: 1,
    maxQualityTier: 'STANDARD',
    privateAssets: false,
    apiAccess: false,
    priorityQueue: false,
    sortOrder: 0,
  },
  {
    key: 'STARTER',
    name: 'Starter',
    priceCentsMonthly: 1200,
    monthlyCredits: 300,
    storageGb: 10,
    parallelGenerations: 2,
    maxQualityTier: 'HIGH',
    privateAssets: true,
    apiAccess: false,
    priorityQueue: false,
    sortOrder: 1,
  },
  {
    key: 'PRO',
    name: 'Pro',
    priceCentsMonthly: 3900,
    monthlyCredits: 1200,
    storageGb: 50,
    parallelGenerations: 4,
    maxQualityTier: 'ULTRA',
    privateAssets: true,
    apiAccess: true,
    priorityQueue: true,
    sortOrder: 2,
  },
  {
    key: 'STUDIO',
    name: 'Studio',
    priceCentsMonthly: 9900,
    monthlyCredits: 4000,
    storageGb: 250,
    parallelGenerations: 8,
    maxQualityTier: 'ULTRA',
    privateAssets: true,
    apiAccess: true,
    priorityQueue: true,
    sortOrder: 3,
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceCentsMonthly: 0,
    monthlyCredits: 0,
    storageGb: 1000,
    parallelGenerations: 32,
    maxQualityTier: 'ULTRA',
    privateAssets: true,
    apiAccess: true,
    priorityQueue: true,
    sortOrder: 4,
  },
];

const PROVIDERS = [
  { providerId: 'mock', displayName: 'Mock Provider (dev)', enabled: true, priority: 1, licenseStatus: 'internal' },
  { providerId: 'triposr', displayName: 'TripoSR', enabled: true, priority: 60, licenseStatus: 'review_required' },
  { providerId: 'triposg', displayName: 'TripoSG', enabled: false, priority: 80, licenseStatus: 'review_required' },
  { providerId: 'trellis2', displayName: 'TRELLIS.2', enabled: false, priority: 100, licenseStatus: 'review_required' },
  { providerId: 'sf3d', displayName: 'Stable Fast 3D', enabled: false, priority: 55, licenseStatus: 'restricted' },
  { providerId: 'hunyuan3d', displayName: 'Hunyuan3D 2.1', enabled: false, priority: 70, licenseStatus: 'restricted' },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
  }
  console.log(`Seeded ${PLANS.length} plans`);

  for (const p of PROVIDERS) {
    await prisma.aIProvider.upsert({
      where: { providerId: p.providerId },
      update: { displayName: p.displayName, priority: p.priority, licenseStatus: p.licenseStatus },
      create: p,
    });
  }
  console.log(`Seeded ${PROVIDERS.length} AI providers`);

  await prisma.systemSetting.upsert({
    where: { key: 'signup_enabled' },
    update: {},
    create: { key: 'signup_enabled', value: true },
  });
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
