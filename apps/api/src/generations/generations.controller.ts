import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { ApiUsageInterceptor } from '../api-keys/api-usage.interceptor';
import { GenerationsService } from './generations.service';
import { ImageTo3DDto, TextTo3DDto } from './dto';

@Controller({ path: 'generations', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  @Post('image-to-3d')
  @ApiScopes('generations:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: ImageTo3DDto) {
    return this.generations.createImageTo3D(user.id, dto);
  }

  @Post('text-to-3d')
  @ApiScopes('generations:write')
  createText(@CurrentUser() user: AuthUser, @Body() dto: TextTo3DDto) {
    return this.generations.createTextTo3D(user.id, dto);
  }

  @Get()
  @ApiScopes('generations:read')
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.generations.list(user.id, Number(take) || 30);
  }

  @Get(':id')
  @ApiScopes('generations:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generations.get(user.id, id);
  }

  @Post(':id/cancel')
  @ApiScopes('generations:write')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generations.cancel(user.id, id);
  }
}
