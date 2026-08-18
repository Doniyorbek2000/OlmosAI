import { GenerationMode } from '@veyra/types';

export interface ParsedPrompt {
  /** Cleaned subject description used for concept-image generation. */
  subject: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  targetPolygons?: number;
  requirePbr: boolean;
  targetEngine?: 'UNITY' | 'UNREAL' | 'GODOT' | 'WEB' | 'MOBILE';
  style?: 'realistic' | 'low-poly' | 'stylized' | 'cartoon' | 'sculpt';
  mode: GenerationMode;
}

const ENGINES: Array<[RegExp, ParsedPrompt['targetEngine']]> = [
  [/\bunreal\b/i, 'UNREAL'],
  [/\bunity(-|\s)?ready\b|\bunity\b/i, 'UNITY'],
  [/\bgodot\b/i, 'GODOT'],
  [/\bmobile\b/i, 'MOBILE'],
  [/\bweb(gl)?\b/i, 'WEB'],
];

const STYLES: Array<[RegExp, ParsedPrompt['style']]> = [
  [/\blow[-\s]?poly\b/i, 'low-poly'],
  [/\brealistic|photoreal|pbr\b/i, 'realistic'],
  [/\bstylized\b/i, 'stylized'],
  [/\bcartoon|toon\b/i, 'cartoon'],
  [/\bsculpt|high[-\s]?detail\b/i, 'sculpt'],
];

/** Parse "N[k] (polygons|polys|tris|triangles)" into an absolute count. */
function parsePolygons(text: string): number | undefined {
  const m = text.match(/(\d[\d,\.]*)\s*(k|thousand)?\s*(?:poly|polys|polygons|tris|triangles)/i);
  if (!m) return undefined;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (m[2]) n *= 1000;
  return Math.round(n);
}

/**
 * Turns a natural-language prompt into a structured request. This is the
 * PROMPT_ANALYSIS stage's core and also backs the AI-agent flow: extract
 * polygon budget, PBR requirement, target engine, and style, then infer a mode.
 */
export function parsePrompt(raw: string): ParsedPrompt {
  const text = raw.trim();

  const targetPolygons = parsePolygons(text);
  const requirePbr = /\bpbr\b|\btextured?\b|\bmaterials?\b/i.test(text);
  const targetEngine = ENGINES.find(([re]) => re.test(text))?.[1];
  const style = STYLES.find(([re]) => re.test(text))?.[1];

  // Negative prompt: capture "no X" / "without X" clauses.
  const negMatch = text.match(/\b(?:no|without|avoid)\s+([^,.;]+)/i);
  const negativePrompt = negMatch ? negMatch[1].trim() : undefined;

  // Subject: strip constraint clauses for a cleaner concept-image prompt.
  const subject = text
    .replace(/(\d[\d,\.]*)\s*(k|thousand)?\s*(?:poly|polys|polygons|tris|triangles)(\s*(max|maximum|budget))?/gi, '')
    .replace(/\b(unity(-|\s)?ready|unity|unreal|godot|mobile|web(gl)?)\b/gi, '')
    .replace(/\bpbr\b|\boptimized for\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*,\s*,/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();

  // Mode inference: engine/polygon target → game-ready; sculpt/realistic → quality.
  let mode: GenerationMode = GenerationMode.BALANCED;
  if (targetEngine || targetPolygons) mode = GenerationMode.GAME_READY;
  else if (style === 'realistic' || style === 'sculpt') mode = GenerationMode.QUALITY;
  else if (style === 'low-poly') mode = GenerationMode.FAST;

  const enhancedPrompt = buildEnhancedPrompt(subject || text, style, requirePbr);

  return {
    subject: subject || text,
    enhancedPrompt,
    negativePrompt,
    targetPolygons,
    requirePbr,
    targetEngine,
    style,
    mode,
  };
}

/** Deterministic prompt enhancement (no external LLM required). */
function buildEnhancedPrompt(subject: string, style?: string, pbr?: boolean): string {
  const parts = [subject, 'single object, centered, full view, plain background'];
  if (style === 'realistic') parts.push('photorealistic, high detail');
  if (style === 'low-poly') parts.push('low-poly, clean topology');
  if (style === 'stylized' || style === 'cartoon') parts.push('stylized, clean shapes');
  if (pbr) parts.push('physically based materials, studio lighting');
  return parts.join(', ');
}
