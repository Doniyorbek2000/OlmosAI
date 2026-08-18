import { Injectable } from '@nestjs/common';

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Content-safety extension point (spec §41). Provider-agnostic: the default is a
 * conservative keyword screen; a real classifier (image + text) drops in behind
 * this interface without touching call sites (prompt submission + gallery
 * publish). Moderation failure keeps content private/unpublished.
 */
@Injectable()
export class ModerationService {
  // Minimal default blocklist — replace with a real moderation provider.
  private readonly blocked = [
    'csam',
    'child sexual',
    'terrorist attack instructions',
  ];

  async checkText(text: string): Promise<ModerationResult> {
    const lower = text.toLowerCase();
    const hit = this.blocked.find((w) => lower.includes(w));
    if (hit) return { allowed: false, reason: 'prohibited content' };
    return { allowed: true };
  }

  async checkImage(_key: string): Promise<ModerationResult> {
    // Extension point for an image classifier; permissive default.
    return { allowed: true };
  }
}
