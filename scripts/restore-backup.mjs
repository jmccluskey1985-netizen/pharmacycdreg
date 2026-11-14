#!/usr/bin/env node
// Restore one pharmacy from its Full backup (Settings → Data → Full backup, JSON).
//
//   node scripts/restore-backup.mjs <backup.json> [--out restore.sql] [--login <auth-user-uuid>] [--no-temp-pins] [--audit-check warn]
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f restore.sql
//
// What it does (docs/BACKUP_AND_RESTORE.md):
// - Writes ONE SQL file that runs as a single transaction: all of it goes in, or none of it.
// - Keeps every original id, line number, timestamp and fingerprint, so the restored register
//   is the same register, not a copy. The append-only guards are paused only for the load,
//   then switched back on before the end of the transaction.
// - Before committing, it re-checks every register's fingerprint chain and the audit chain.
//   If any line differs from what was exported, the whole restore is rolled back.
// - Records the restore itself in the audit trail ("data.restored").
//
// Not in a backup, on purpose: staff PIN hashes (a 4-6 digit PIN is easy to recover from a hash)
// and the pharmacy login. So each supervising pharmacist gets a one-off random PIN, printed here
// (never written to the SQL file), and --login links an existing Supabase Auth user to the pharmacy.
// Photos on notes live in Supabase Storage and are not in the file.
//
// The SQL file contains patient data. Keep it as carefully as the backup, and delete it afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomInt, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

/** Password-protected backups (src/lib/backup-crypto.ts): PBKDF2-SHA256 → AES-256-GCM over gzip. */
function decryptBackup(env, password) {
  if (env.cipher !== 'AES-256-GCM' || env.kdf?.name !== 'PBKDF2' || env.kdf?.hash !== 'SHA-256') throw new Error('Unknown backup encryption');
  const key = pbkdf2Sync(password, Buffer.from(env.kdf.salt, 'base64'), env.kdf.iterations, 32, 'sha256');
  const blob = Buffer.from(env.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAuthTag(blob.subarray(blob.length - 16));
  try { return gunzipSync(Buffer.concat([d.update(blob.subarray(0, blob.length - 16)), d.final()])).toString('utf8'); }
  catch { throw new Error('Wrong password, or the file has been changed.'); }
}

async function askPassword() {
  if (process.env.CDREG_BACKUP_PASSWORD) return process.env.CDREG_BACKUP_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('This backup is password protected: set CDREG_BACKUP_PASSWORD or run in a terminal.');
  process.stdout.write('Backup password: ');
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let pw = '';
    process.stdin.on('data', (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(pw); }
      else if (ch === '\u0003') process.exit(130);
      else if (ch === '\u007f') pw = pw.slice(0, -1);
      else pw += ch;
    });
  });
}

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const WITH_VALUE = new Set(['--out', '--login', '--audit-check']);
const file = args.find((a, i) => !a.startsWith('--') && !WITH_VALUE.has(args[i - 1]));
if (!file) { console.error('Usage: node scripts/restore-backup.mjs <backup.json> [--out restore.sql] [--login <auth-user-uuid>] [--no-temp-pins]'); process.exit(2); }
const out = opt('--out') ?? 'restore.sql';
const login = opt('--login');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (login && !UUID.test(login)) { console.error('--login must be the user id (uuid) from Supabase → Authentication → Users'); process.exit(2); }

let raw = readFileSync(file, 'utf8');
let b = JSON.parse(raw);
if (b.format === 'pharmacycdreg-backup-encrypted') {
  try { raw = decryptBackup(b, await askPassword()); } catch (e) { console.error(e.message); process.exit(2); }
  b = JSON.parse(raw);
}
if (b.format !== 'pharmacycdreg-backup') { console.error('This is not a PharmacyCDReg full backup file.'); process.exit(2); }
if (b.version !== 1) { console.error(`Backup format version ${b.version} is not supported by this loader.`); process.exit(2); }
const ph = b.pharmacy?.id;
if (!ph || !UUID.test(ph)) { console.error('The backup has no pharmacy id.'); process.exit(2); }

const warnings = [];
const rows = (key) => {
  const v = b[key];
  if (v == null) return [];
  if (!Array.isArray(v)) { warnings.push(`${key}: not in the backup (${v.unavailable ?? 'missing'}), skipped`); return []; }
  return v;
};

// Dollar-quote tag that cannot appear in the data
let tag = 'cdreg';
while (raw.includes(`$${tag}$`)) tag = 'cdreg' + randomBytes(4).toString('hex');
const lit = (v) => `$${tag}$${JSON.stringify(v)}$${tag}$`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Unexpected column name ${s}`); return s; };

const sql = [];
const counts = {};
/**
 * insert into <table> (cols) select <exprs> from json_populate_recordset(null::<table>, <json>) r
 * `over` swaps a column's value for an expression over r (e.g. to drop a link that can't exist yet).
 */
function load(table, data, { over = {}, extra = '', identity = false, order = '' } = {}) {
  if (!data.length) return;
  // *_raw keys carry exact text for a column (see audit_log.details_raw); they aren't columns themselves
  const cols = Array.from(new Set(data.flatMap((r) => Object.keys(r)))).filter((c) => !c.endsWith('_raw')).map(ident);
  const sel = cols.map((c) => over[c] ?? `r.${c}`).join(', ');
  sql.push(`insert into ${table} (${cols.join(', ')})${identity ? ' overriding system value' : ''}\n  select ${sel} from json_array_elements(${lit(data)}) as j(v), json_populate_record(null::${table}, j.v) r${order ? ` order by ${order}` : ''}${extra ? `\n  ${extra}` : ''};`);
  counts[table] = data.length;
}

const pharmacy = b.pharmacy;
const staff = rows('staff');
const products = rows('products');
const registers = rows('registers');
const patients = rows('patients');
const entries = rows('entries');
const audit = rows('audit_log');
for (const k of ['note_attachments']) if (rows(k).length) warnings.push(`${k}: ${rows(k).length} photo record(s) restored, but the photos themselves are in Supabase Storage (bucket cd-notes) and must be copied separately`);

sql.push(`-- PharmacyCDReg restore of "${String(pharmacy.name).replace(/\n/g, ' ')}" from a backup exported ${b.exported_at}`);
sql.push('-- Contains patient data: keep it safe and delete it when done.');
sql.push('\\set ON_ERROR_STOP on');
sql.push('begin;');
sql.push("set local timezone = 'UTC';");
sql.push(`do $chk$ begin
  if exists (select 1 from pharmacies where id = ${q(ph)}) then
    raise exception 'This pharmacy is already in the database. Restore into a new Supabase project, or remove it first.';
  end if;
  if exists (select 1 from audit_log where id in (select (j->>'id')::bigint from json_array_elements(${lit(audit.map((a) => ({ id: a.id })))}) j)) then
    raise exception 'Audit trail ids already used in this database: restore into a new Supabase project.';
  end if;
end $chk$;`);

// Pause the append-only guards (and the triggers that would re-number, re-stamp and re-audit lines)
const GUARDED = ['cd_entries', 'audit_log', 'stock_checks', 'quarantine_items', 'destruction_book'];
for (const t of GUARDED) sql.push(`alter table ${t} disable trigger user;`);

load('pharmacies', [pharmacy]);
load('staff', staff.map((s) => ({ ...s, pin_hash: null })));
// Products are shared by every pharmacy: add any that aren't there; stereoisomer links second
load('cd_products', products, { over: { is_stereoisomer_of: 'null' }, extra: 'on conflict (id) do nothing' });
if (products.some((p) => p.is_stereoisomer_of)) sql.push(`update cd_products p set is_stereoisomer_of = r.is_stereoisomer_of from json_populate_recordset(null::cd_products, ${lit(products)}) r where p.id = r.id and p.is_stereoisomer_of is null and r.is_stereoisomer_of in (select id from cd_products);`);
load('cd_registers', registers);
load('patients', patients, { over: { merged_into: 'null' } });
if (patients.some((p) => p.merged_into)) sql.push(`update patients p set merged_into = r.merged_into from json_populate_recordset(null::patients, ${lit(patients.filter((p) => p.merged_into))}) r where p.id = r.id;`);
// Lines in order (a correction always comes after the line it corrects). Scans aren't in a backup:
// the scan link is dropped (it isn't part of the line's fingerprint).
load('cd_entries', entries, { over: { scan_id: 'case when r.scan_id in (select id from scans) then r.scan_id end' }, order: 'r.register_id, r.seq' });
if (entries.some((e) => e.scan_id)) warnings.push('cd_entries: links to scanned images dropped (scans are not in a backup; the lines themselves are unchanged)');
load('stock_checks', rows('stock_checks'));
load('quarantine_items', rows('quarantine_items'));
load('destruction_book', rows('destruction_book'));
load('contacts', rows('contacts'));
load('dispense_reminders', rows('dispense_reminders'));
load('notes', rows('notes'));
load('note_attachments', rows('note_attachments'));
load('audit_log', audit, { identity: true, order: 'r.chain_seq', over: { details: "coalesce((j.v->>'details_raw')::jsonb, r.details)" } });
const exactAudit = audit.every((a) => 'details_raw' in a);
if (!exactAudit && audit.length) warnings.push('audit_log: this backup was made before audit details were saved exactly; numbers like 28.000 may read back as 28, so older audit records can fail the audit fingerprint check. Re-run with --audit-check warn to restore anyway (registers are still checked strictly).');
const auditStrict = opt('--audit-check') !== 'warn';
sql.push(`select setval(pg_get_serial_sequence('audit_log', 'id'), greatest((select max(id) from audit_log), 1));`);

for (const t of GUARDED) sql.push(`alter table ${t} enable trigger user;`);

// One-off PINs for the supervising pharmacist(s), who then reset everyone else's in Team
const pins = [];
if (!args.includes('--no-temp-pins')) {
  const used = new Set();
  for (const s of staff.filter((x) => x.role === 'supervising_pharmacist' && x.is_active !== false)) {
    let pin; do { pin = String(randomInt(0, 1_000_000)).padStart(6, '0'); } while (used.has(pin)); used.add(pin);
    pins.push({ name: s.full_name, pin });
    sql.push(`update staff set pin_hash = ${q(bcrypt.hashSync(pin, 10))} where id = ${q(s.id)};`);
  }
}
if (login) sql.push(`insert into pharmacy_accounts (auth_user_id, pharmacy_id) values (${q(login)}, ${q(ph)});`);

// Prove the restore is faithful before committing: every register chain and the audit chain
sql.push(`do $verify$ declare r record; n integer := 0; begin
  for r in select g.id, v.* from cd_registers g, lateral verify_register_chain(g.id) v where g.pharmacy_id = ${q(ph)} loop
    if not r.ok then raise exception 'Register % failed its integrity check at line % (%). Nothing was restored.', r.id, r.broken_seq, r.reason; end if;
    n := n + r.checked;
  end loop;
  if n <> ${entries.length} then raise exception 'Expected ${entries.length} register lines, found %. Nothing was restored.', n; end if;
  for r in select * from verify_audit_chain(${q(ph)}) loop
    if not r.ok then ${auditStrict ? "raise exception 'Audit trail failed its integrity check at record % (%). Nothing was restored.'" : "raise warning 'Audit trail fingerprint differs from record % (%): restored anyway (--audit-check warn).'"}, r.broken_seq, r.reason; end if;
  end loop;
  raise notice 'Verified: % register lines and the audit trail match the backup', n;
end $verify$;`);
// The restore itself goes on the record (chained after the restored audit trail)
sql.push(`insert into audit_log (pharmacy_id, action, details) values (${q(ph)}, 'data.restored', ${lit({ backup_exported_at: b.exported_at, entries: entries.length, audit_records: audit.length, temp_pins_for: pins.map((p) => p.name) })}::jsonb);`);
sql.push('commit;');

writeFileSync(out, sql.join('\n\n') + '\n', { mode: 0o600 });
console.log(`Wrote ${out} for "${pharmacy.name}" (backup of ${b.exported_at}).`);
console.log(Object.entries(counts).map(([t, n]) => `  ${t}: ${n}`).join('\n'));
for (const w of warnings) console.log(`Note: ${w}`);
if (pins.length) {
  console.log('\nOne-off PINs (shown once, not stored in the file). Change them in Team after signing in:');
  for (const p of pins) console.log(`  ${p.name}: ${p.pin}`);
}
if (!login) console.log('\nNo --login given: link a pharmacy login afterwards (Supabase → Authentication → create the user, then run\n  insert into pharmacy_accounts (auth_user_id, pharmacy_id) values (\'<user id>\', \'' + ph + '\');)');
console.log(`\nNext: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${out}`);
