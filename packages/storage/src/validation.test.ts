import { describe, expect, it } from 'vitest';
import { detectType, validateUpload } from './validation.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0, 0, 0, 0, 0, 0, 0]);
const bogus = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

describe('detectType', () => {
  it('detects PNG and GLB by magic bytes', () => {
    expect(detectType(png).format).toBe('PNG');
    expect(detectType(glb).format).toBe('GLB');
    expect(detectType(bogus).kind).toBe('unknown');
  });
});

describe('validateUpload', () => {
  it('accepts a real PNG when an image is expected', () => {
    const r = validateUpload({ expected: 'image', size: 1000, head: png });
    expect(r.ok).toBe(true);
  });

  it('rejects a GLB masquerading as an image', () => {
    const r = validateUpload({ expected: 'image', size: 1000, head: glb, filename: 'evil.png' });
    expect(r.ok).toBe(false);
  });

  it('rejects oversized files', () => {
    const r = validateUpload({ expected: 'image', size: 999_999_999, head: png });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceeds/);
  });

  it('accepts ascii OBJ by extension hint when a model is expected', () => {
    const r = validateUpload({ expected: 'model', size: 1000, head: bogus, filename: 'chair.obj' });
    expect(r.ok).toBe(true);
    expect(r.detected.format).toBe('OBJ');
  });
});
