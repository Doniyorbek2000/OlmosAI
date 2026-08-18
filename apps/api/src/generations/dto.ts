import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const MODES = [
  'FAST',
  'BALANCED',
  'QUALITY',
  'ULTRA',
  'GAME_READY',
  'MOBILE_GAME',
  '3D_PRINT',
  'CHARACTER',
  'PRODUCT_VISUALIZATION',
] as const;

export class ImageInputDto {
  @IsString()
  @MaxLength(500)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  view?: string;
}

export class ImageTo3DDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ImageInputDto)
  images!: ImageInputDto[];

  @IsOptional()
  @IsEnum(MODES)
  mode?: (typeof MODES)[number];

  @IsOptional()
  @IsBoolean()
  requirePbr?: boolean;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(2_000_000)
  targetPolygons?: number;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Client-supplied idempotency key to prevent double-charging. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class TextTo3DDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1500)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  negativePrompt?: string;

  @IsOptional()
  @IsEnum(MODES)
  mode?: (typeof MODES)[number];

  @IsOptional()
  @IsBoolean()
  requirePbr?: boolean;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(2_000_000)
  targetPolygons?: number;

  @IsOptional()
  @IsInt()
  seed?: number;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
