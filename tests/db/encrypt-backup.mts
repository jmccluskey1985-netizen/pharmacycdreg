// Test helper: encrypt a backup exactly as the browser does (src/lib/backup-crypto.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { encryptBackup } from '../../src/lib/backup-crypto';
const [, , src, dst, pw] = process.argv;
writeFileSync(dst, await encryptBackup(readFileSync(src, 'utf8'), pw));
