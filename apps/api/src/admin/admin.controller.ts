import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { FeatureFlagState } from '@veyra/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AdminService } from './admin.service';

class UpdateProviderDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) priority?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) costMultiplier?: number;
  @IsOptional() @IsBoolean() draining?: boolean;
}

class UpdateWorkerDto {
  @IsOptional()
  @IsIn(['ONLINE', 'BUSY', 'DRAINING', 'OFFLINE', 'ERROR'])
  status?: string;

  @IsOptional() @IsInt() @Min(0) @Max(64) maxConcurrency?: number;
}

/** Admin-only. No arbitrary command execution — only structured controls (§53). */
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get('feature-flags')
  featureFlags() {
    return this.flags.all();
  }

  @Patch('feature-flags/:flag')
  setFlag(@Param('flag') flag: string, @Body() dto: { enabled: boolean }) {
    return this.flags.setFlag(flag as keyof FeatureFlagState, Boolean(dto.enabled));
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users(@Query('q') q?: string, @Query('take') take?: string) {
    return this.admin.listUsers(q, Number(take) || 50);
  }

  @Get('jobs')
  jobs(@Query('status') status?: string, @Query('take') take?: string) {
    return this.admin.listJobs(status, Number(take) || 50);
  }

  @Get('providers')
  providers() {
    return this.admin.listProviders();
  }

  @Patch('providers/:providerId')
  updateProvider(@Param('providerId') providerId: string, @Body() dto: UpdateProviderDto) {
    return this.admin.updateProvider(providerId, dto);
  }

  @Get('gpus')
  workers() {
    return this.admin.listWorkers();
  }

  @Patch('gpus/:id')
  updateWorker(@Param('id') id: string, @Body() dto: UpdateWorkerDto) {
    return this.admin.updateWorker(id, dto);
  }
}
