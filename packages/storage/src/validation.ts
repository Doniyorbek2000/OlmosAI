/**
 * File validation for untrusted uploads. We never trust the client-provided
 * extension or content-type — magic bytes decide, plus size limits (spec §33).
 */

export interface DetectedType {
  kind: 'image' | 'model' | 'unknown';
  format?: string;
  mime?: string;
}

const MAX_SIZES: Record<string, number> = {
  image: 25 * 1024 * 1024, // 25 MB
  model: 200 * 1024 * 1024, // 200 MB
};

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

/** Detect a file type from its leading magic bytes. */
export function detectType(buf: Uint8Array): DetectedType {
  // PNG
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) {
    return { kind: 'image', format: 'PNG', mime: 'image/png' };
  }
  // JPEG
  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    return { kind: 'image', format: 'JPEG', mime: 'image/jpeg' };
  }
  // WEBP: RIFF....WEBP
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { kind: 'image', format: 'WEBP', mime: 'image/webp' };
  }
  // GLB: "glTF"
  if (startsWith(buf, [0x67, 0x6c, 0x54, 0x46])) {
    return { kind: 'model', format: 'GLB', mime: 'model/gltf-binary' };
  }
  return { kind: 'unknown' };
}

export interface ValidateOptions {
  expected: 'image' | 'model';
  size: number;
  /** First bytes of the file (>= 16 bytes recommended). */
  head: Uint8Array;
  /** Optional filename, used only as a soft hint for text formats. */
  filename?: string;
}

export interface ValidationResult {
  ok: boolean;
  detected: DetectedType;
  reason?: string;
}

const TEXT_MODEL_EXT = new Set(['obj', 'gltf', 'stl']);

/** Validate an upload before it is registered/processed. */
export function validateUpload(opts: ValidateOptions): ValidationResult {
  const maxSize = MAX_SIZES[opts.expected];
  if (opts.size > maxSize) {
    return { ok: false, detected: { kind: 'unknown' }, reason: `File exceeds ${maxSize} bytes` };
  }
  const detected = detectType(opts.head);
  if (detected.kind === opts.expected) {
    return { ok: true, detected };
  }
  // Text-based 3D formats (OBJ/GLTF/STL-ascii) have no reliable binary magic;
  // accept by extension hint but only when a model was expected.
  if (opts.expected === 'model' && opts.filename) {
    const ext = opts.filename.split('.').pop()?.toLowerCase();
    if (ext && TEXT_MODEL_EXT.has(ext)) {
      return { ok: true, detected: { kind: 'model', format: ext.toUpperCase() } };
    }
  }
  return {
    ok: false,
    detected,
    reason: `Expected ${opts.expected}, detected ${detected.kind}`,
  };
}
