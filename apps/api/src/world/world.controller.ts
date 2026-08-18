import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsOptional, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { ApiUsageInterceptor } from '../api-keys/api-usage.interceptor';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { WorldService } from './world.service';

class CreateWorldBody {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  prompt!: string;

  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsInt() seed?: number;
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;
}

@Controller({ path: 'worlds', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
export class WorldController {
  constructor(private readonly world: WorldService) {}

  @Post()
  @ApiScopes('generations:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorldBody) {
    return this.world.create(user.id, dto);
  }

  @Get()
  @ApiScopes('assets:read')
  list(@CurrentUser() user: AuthUser) {
    return this.world.listWorlds(user.id);
  }

  @Get(':id')
  @ApiScopes('assets:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.world.getWorld(user.id, id);
  }

  @Get(':id/download')
  @ApiScopes('assets:read')
  download(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.world.download(user.id, id);
  }

  @Delete(':id')
  @ApiScopes('assets:write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.world.remove(user.id, id);
  }
}
