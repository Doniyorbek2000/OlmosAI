import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { encodePng } from './png';
import { renderConceptPng } from './concept-image.service';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('encodePng', () => {
  it('produces a valid PNG with signature, IHDR, IDAT, IEND', () => {
    const size = 4;
    const rgba = new Uint8Array(size * size * 4).fill(200);
    const png = encodePng(size, size, rgba);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.includes(Buffer.from('IHDR'))).toBe(true);
    expect(png.includes(Buffer.from('IDAT'))).toBe(true);
    expect(png.includes(Buffer.from('IEND'))).toBe(true);

    // IHDR dimensions.
    const ihdrStart = png.indexOf(Buffer.from('IHDR')) + 4;
    expect(png.readUInt32BE(ihdrStart)).toBe(size);
    expect(png.readUInt32BE(ihdrStart + 4)).toBe(size);
  });

  it('IDAT decompresses to width*height*(4+1) bytes (filter byte per row)', () => {
    const w = 3;
    const h = 2;
    const rgba = new Uint8Array(w * h * 4).fill(128);
    const png = encodePng(w, h, rgba);
    const idatIdx = png.indexOf(Buffer.from('IDAT'));
    const len = png.readUInt32BE(idatIdx - 4);
    const data = png.subarray(idatIdx + 4, idatIdx + 4 + len);
    const raw = inflateSync(data);
    expect(raw.length).toBe(h * (w * 4 + 1));
  });
});

describe('renderConceptPng', () => {
  it('is deterministic for the same prompt + seed', () => {
    const a = renderConceptPng('a viking axe', 7, 64);
    const b = renderConceptPng('a viking axe', 7, 64);
    expect(a.equals(b)).toBe(true);
  });

  it('differs for different prompts', () => {
    const a = renderConceptPng('a viking axe', 7, 64);
    const b = renderConceptPng('a ceramic teapot', 7, 64);
    expect(a.equals(b)).toBe(false);
  });

  it('emits a valid PNG', () => {
    const png = renderConceptPng('sword', undefined, 32);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });
});
