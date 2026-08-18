import { describe, expect, it } from 'vitest';
import { buildZip } from './zip';
import { crc32 } from '../workflows/png';

describe('buildZip', () => {
  it('produces a structurally valid store-only zip', () => {
    const a = Buffer.from('glTF-binary-bytes');
    const b = Buffer.from('{"k":1}');
    const zip = buildZip([
      { name: 'model.glb', data: a },
      { name: 'metadata.json', data: b },
    ]);

    // Local file header signature at the start.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // End-of-central-directory record at the end.
    const eocdOffset = zip.length - 22;
    expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50);
    // Two entries recorded in the EOCD.
    expect(zip.readUInt16LE(eocdOffset + 10)).toBe(2);
    // First local header stores the CRC of the first entry's data.
    expect(zip.readUInt32LE(14)).toBe(crc32(a));
    // Uncompressed size == stored size (store method).
    expect(zip.readUInt32LE(18)).toBe(a.length);
    expect(zip.readUInt32LE(22)).toBe(a.length);
  });
});
