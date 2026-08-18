import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      service: 'api',
      brand: this.config.branding.name,
      db,
      time: new Date().toISOString(),
    };
  }

  @Get('config/public')
  publicConfig() {
    return {
      brand: this.config.branding.name,
      features: this.flags.all(),
    };
  }
}
