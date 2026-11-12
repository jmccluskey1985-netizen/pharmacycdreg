import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deflateSync } from 'zlib';
import { requireStaff, errorResponse, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';
import { getReaderConfig } from '@/lib/reader-config';
import { readDocument, parseJsonWith, ScanError } from '@/lib/scan-extract';

export const maxDuration = 60;

/** A tiny plain PNG (no patient data) so the test exercises the same photo + JSON path as a real scan. */
function testPng(): string {
  const w = 64, h = 32;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const Schema = z.object({ ok: z.preprocess((v) => v === true || v === 'true', z.boolean()), colour: z.string().nullable().catch(null) });
const JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['ok', 'colour'], properties: { ok: { type: 'boolean' }, colour: { type: ['string', 'null'] } } };

// Site owner: check the saved key + model actually work (photo in, structured JSON out, zero-retention providers).
export async function POST() {
  try {
    const { account } = await requireStaff();
    if (!isSiteAdmin(account.email)) throw new HttpError(404, 'Not found');
    const reader = await getReaderConfig(createServiceClient());
    if (!reader) return NextResponse.json({ ok: false, message: 'No key and model saved yet.' });
    const t0 = Date.now();
    try {
      const { result, model } = await readDocument([{ base64: testPng(), mediaType: 'image/png' }], {
        system: 'You check that image reading works.', schema: JSON_SCHEMA, name: 'reader_test',
        prompt: 'Set ok to true and colour to the main colour of this image.', parse: parseJsonWith(Schema), reader,
      });
      return NextResponse.json({ ok: result.ok, message: `Working — ${model} answered in ${((Date.now() - t0) / 1000).toFixed(1)}s.` });
    } catch (e) {
      return NextResponse.json({ ok: false, message: e instanceof ScanError ? e.message : 'The test failed.' });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
