import { Body, Controller, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { ApiUsageInterceptor } from '../api-keys/api-usage.interceptor';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AssetProcessingService } from './asset-processing.service';

class DecimateDto {
  @IsInt()
  @Min(100)
  @Max(2_000_000)
  targetPolygons!: number;
}

class ConvertDto {
  @IsIn(['GLB', 'GLTF', 'OBJ', 'STL', 'PLY'])
  format!: 'GLB' | 'GLTF' | 'OBJ' | 'STL' | 'PLY';
}

class RetextureDto {
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a #RRGGBB hex' })
  color!: string;
}

class GameReadyDto {
  @IsOptional()
  @IsIn(['UNITY', 'UNREAL', 'GODOT', 'WEB', 'MOBILE'])
  targetEngine?: 'UNITY' | 'UNREAL' | 'GODOT' | 'WEB' | 'MOBILE';

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(2_000_000)
  targetPolygons?: number;

  @IsOptional()
  @IsBoolean()
  generateLods?: boolean;

  @IsOptional()
  @IsBoolean()
  generateCollider?: boolean;
}

@Controller({ path: 'assets', version: '1' })
@UseGuards(HybridAuthGuard)
@UseInterceptors(ApiUsageInterceptor)
@ApiScopes('assets:write')
export class AssetProcessingController {
  constructor(private readonly processing: AssetProcessingService) {}

  @Post(':id/optimize')
  optimize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.processing.optimize(user.id, id);
  }

  @Post(':id/decimate')
  decimate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecimateDto) {
    return this.processing.decimate(user.id, id, dto.targetPolygons);
  }

  @Post(':id/remesh')
  remesh(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.processing.remesh(user.id, id);
  }

  @Post(':id/retexture')
  retexture(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RetextureDto) {
    return this.processing.retexture(user.id, id, dto.color);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConvertDto) {
    return this.processing.convert(user.id, id, dto.format);
  }

  @Post(':id/game-ready')
  gameReady(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GameReadyDto) {
    return this.processing.gameReady(user.id, id, dto);
  }
}
