# Backup and restore runbook

## What protects the data
| Layer | What | Who |
|---|---|---|
| Append-only design | Register lines and the audit trail can't be updated or deleted (DB triggers), so an app bug can't destroy history | Built in |
| Integrity chain | SHA-256 fingerprint per line (migration 0013); `verify_register_chain` / `verify_audit_chain` and the **Verify integrity** button | Built in |
| Provider backups | Supabase daily backups (Pro plan: 7 days; add **Point-in-Time Recovery** for restore to any second) | Operator: enable in Supabase → Database → Backups |
| Customer copies | Settings → Data → **Full backup (JSON)** and **Export every register (CSV)** | Each pharmacy, monthly recommended |
| Off-system fingerprint | Monday email with every register's latest fingerprint | Built in (cron `daily-digest`) |

## Restore test (do it once, then yearly, and record the result)
1. Supabase → Database → Backups → pick a recent backup → **Restore to a new project** (never over production).
2. In the new project, run:
   ```sql
   select count(*) from cd_entries;
   select r.id, v.* from cd_registers r, lateral verify_register_chain(r.id) v where not v.ok;  -- expect no rows
   select p.id, v.* from pharmacies p, lateral verify_audit_chain(p.id) v where not v.ok;       -- expect no rows
   ```
3. Compare the entry count with production, and the latest fingerprints with the last Monday email.
4. Record it as evidence (IPU NFR6–9): the date, the backup timestamp, the counts, "chains verified", and who did it.
5. Delete the test project.

## Restoring production after an incident
1. **Stop writes:** in Vercel, set the env `SIGNIN_UNLOCK_CODE` to a new value and redeploy, or pause the project.
2. Decide on the restore point: the last good time, from the audit trail or the point-in-time logs.
3. Restore to a **new** Supabase project, verify it as above, then point `SUPABASE_URL` and the keys at it and redeploy.
4. Tell the affected pharmacies what happened and the restore time. Ask them to re-enter anything after that point from their paper fallback sheets, as **late entries**.
5. Personal data breach? The controller (pharmacy) must be told without undue delay (DPA clause 4.7). They notify the DPC within 72 hours if required.

## Restoring one pharmacy from its own JSON backup

Use this when the database is lost and there's no Supabase backup to go back to, or to move one pharmacy to a new project. The loader is `scripts/restore-backup.mjs`. It's tested on every CI run (`tests/db/restore.sh`: export, wipe, restore, then compare every fingerprint).

1. Make a **new** Supabase project in the EU and run every migration in `supabase/migrations/` in order.
2. In **Authentication → Users**, create the pharmacy's login and copy its user id.
3. On a trusted computer with the repository checked out:
   ```bash
   npm ci
   node scripts/restore-backup.mjs pharmacycdreg-backup-YYYY-MM-DD.json --login <user id> --out restore.sql
   ```
   It prints what it will load, any notes, and a **one-off PIN** for each supervising pharmacist. The PIN is shown once and is not written into the SQL file.
4. Run it against the new project (Supabase → **Connect** → session pooler connection string; keep the password out of shell history):
   ```bash
   psql "<connection string>" -v ON_ERROR_STOP=1 -f restore.sql
   ```
5. Point the app at the new project (Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and redeploy.
6. The supervising pharmacist signs in with the one-off PIN and sets new PINs for everyone in **Team**.
7. **Delete `restore.sql` and any copies of the backup** you no longer need: both contain patient data.

What the loader guarantees:
- **All or nothing:** one transaction. Any error, and nothing is written.
- **The same register, not a copy:** original ids, line numbers, dates, signatures and fingerprints are kept. The append-only guards are paused only during the load and are back on before it commits.
- **Proven before it commits:** every register's fingerprint chain and the audit trail are re-checked. One changed line (or a tampered file) and the whole restore is refused.
- **On the record:** the restore adds a `data.restored` entry to the audit trail.
- **Refuses to overwrite:** if the pharmacy is already in the database, it stops.

What a backup does not contain:
- **PIN hashes:** left out on purpose (a 4 to 6 digit PIN is easy to recover from its hash). Hence the one-off PINs.
- **The login:** created in step 2.
- **Note photos and scan images:** stored in Supabase Storage (bucket `cd-notes`), not in the file. Copy the bucket separately if needed. Links from register lines to their original scan are dropped; the lines themselves are unchanged.

Backups made before audit details were saved exactly (before November 2026) can fail the audit-trail check because numbers like `28.000` were saved as `28`. Add `--audit-check warn` to restore them: registers are still checked strictly.
