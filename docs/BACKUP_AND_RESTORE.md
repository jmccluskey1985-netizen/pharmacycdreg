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
The JSON file contains every table for that pharmacy. Import it into a fresh project with a script that inserts in this order:

pharmacies → staff → products → registers → entries (ordered by seq) → the rest.

Run the import with `set session_replication_role = replica;`. Otherwise the insert triggers re-number lines and re-stamp `recorded_at`. Entries then keep their stored `seq`, `recorded_at` and `row_hash`. Run `verify_register_chain` afterwards to prove the restore is faithful.
