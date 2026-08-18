import { Controller, Get } from '@nestjs/common';

/**
 * Generation presets (spec §55). Each maps to a generation configuration
 * (mode + material + polygon target + style). Data-driven so the UI renders
 * them without hardcoding; users can layer custom presets later.
 */
export const PRESETS = [
  { key: 'game_character', name: 'Game Character', mode: 'CHARACTER', requirePbr: true, targetPolygons: 20000, style: 'realistic' },
  { key: 'game_prop', name: 'Game Prop', mode: 'GAME_READY', requirePbr: true, targetPolygons: 8000, style: 'realistic' },
  { key: 'product', name: 'Product', mode: 'PRODUCT_VISUALIZATION', requirePbr: true, style: 'realistic' },
  { key: 'furniture', name: 'Furniture', mode: 'QUALITY', requirePbr: true, style: 'realistic' },
  { key: 'architecture', name: 'Architecture Asset', mode: 'GAME_READY', requirePbr: false, targetPolygons: 30000, style: 'realistic' },
  { key: 'low_poly', name: 'Low Poly', mode: 'FAST', requirePbr: false, targetPolygons: 2000, style: 'low-poly' },
  { key: 'realistic', name: 'Realistic', mode: 'ULTRA', requirePbr: true, style: 'realistic' },
  { key: 'print_3d', name: '3D Print', mode: '3D_PRINT', requirePbr: false, style: 'sculpt' },
] as const;

@Controller({ path: 'presets', version: '1' })
export class PresetsController {
  @Get()
  list() {
    return PRESETS;
  }
}
