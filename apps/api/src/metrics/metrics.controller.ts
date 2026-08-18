import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

/** Prometheus scrape endpoint at /api/metrics. */
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('content-type', this.metrics.contentType);
    res.send(await this.metrics.render());
  }
}
