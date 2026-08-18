import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { ApiUsageInterceptor } from '../api-keys/api-usage.interceptor';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { MotionService } from './motion.service';

class TextToMotionBody {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  prompt!: string;

  @IsOptional() @IsNumber() @Min(0.2) @Max(30) durationSeconds?: number;
  @IsOptional() @IsInt() @Min(6) @Max(60) fps?: number;
  @IsOptional() @IsInt() seed?: number;
  @IsOptional() @IsString() characterAssetId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;
}

class AttachBody {
  @IsString()
  characterAssetId!: string;
}

@Controller({ path: 'motion', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
export class MotionController {
  constructor(private readonly motion: MotionService) {}

  @Post('text-to-motion')
  @ApiScopes('generations:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: TextToMotionBody) {
    return this.motion.createTextToMotion(user.id, dto);
  }
}

@Controller({ path: 'animations', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
export class AnimationsController {
  constructor(private readonly motion: MotionService) {}

  @Get()
  @ApiScopes('assets:read')
  list(@CurrentUser() user: AuthUser, @Query('characterAssetId') characterAssetId?: string) {
    return this.motion.listAnimations(user.id, characterAssetId);
  }

  @Get(':id')
  @ApiScopes('assets:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.motion.getAnimation(user.id, id);
  }

  @Get(':id/download')
  @ApiScopes('assets:read')
  download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('format') format?: string) {
    return this.motion.download(user.id, id, format === 'fbx' ? 'fbx' : 'glb');
  }

  @Post(':id/attach')
  @ApiScopes('assets:write')
  attach(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AttachBody) {
    return this.motion.attach(user.id, id, dto.characterAssetId);
  }

  @Post(':id/detach')
  @ApiScopes('assets:write')
  detach(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.motion.detach(user.id, id);
  }

  @Delete(':id')
  @ApiScopes('assets:write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.motion.remove(user.id, id);
  }
}
