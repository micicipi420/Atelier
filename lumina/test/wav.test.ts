import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/library/demo';

describe('encodeWav', () => {
  it('writes a valid 16-bit PCM header', async () => {
    const L = new Float32Array([0, 0.5, -0.5, 1]);
    const R = new Float32Array([0, -0.5, 0.5, -1]);
    const blob = encodeWav([L, R], 8000);
    const buf = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(buf.getUint8(o), buf.getUint8(o + 1), buf.getUint8(o + 2), buf.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(buf.getUint16(22, true)).toBe(2);
    expect(buf.getUint32(24, true)).toBe(8000);
    expect(buf.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(buf.getInt16(44 + 2, true)).toBe(0); // R[0]
    expect(buf.getInt16(44 + 4, true)).toBe(16383); // L[1] = 0.5
    expect(buf.getInt16(44 + 14, true)).toBe(-32768); // R[3] = -1
  });
});
