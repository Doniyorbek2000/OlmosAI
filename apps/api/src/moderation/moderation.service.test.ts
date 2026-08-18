import { describe, expect, it } from 'vitest';
import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  const mod = new ModerationService();

  it('allows normal creative prompts', async () => {
    expect((await mod.checkText('a realistic viking axe')).allowed).toBe(true);
  });

  it('blocks prohibited content', async () => {
    const r = await mod.checkText('a CSAM image');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it('is permissive on images by default (extension point)', async () => {
    expect((await mod.checkImage('some/key.png')).allowed).toBe(true);
  });
});
