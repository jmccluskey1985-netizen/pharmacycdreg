# Backup → wipe → restore round trip for one pharmacy (sourced by tests/db/run.sh; uses $P and $DIR).
# Exports pharmacy aaaa… the way /api/backup does, deletes it, restores it with
# scripts/restore-backup.mjs, and checks every fingerprint is identical.
X=aaaaaaaa-0000-0000-0000-000000000001
U=a0000000-0000-0000-0000-0000000000aa
rfail=0
ok() { echo "ok   $1"; }
no() { echo "FAIL $1"; rfail=1; }
$P -c "insert into pharmacy_accounts(auth_user_id,pharmacy_id) values ('$U','$X') on conflict do nothing;" >/dev/null
$P -c "insert into notes(pharmacy_id,title,body,created_by_staff_id) values ('$X','Fridge check','All fine','aaaaaaaa-0000-0000-0000-000000000002');" >/dev/null 2>&1 || true
$P -c "insert into contacts(pharmacy_id,kind,name,address) values ('$X','prescriber','Dr Made Up','Ennis');" >/dev/null 2>&1 || true
EXPORT="select json_build_object('format','pharmacycdreg-backup','version',1,'exported_at',now(),'exported_by','Test',
 'pharmacy',(select to_json(p) from pharmacies p where id='$X'),
 'staff',(select coalesce(json_agg(to_jsonb(s)-'pin_hash'),'[]') from staff s where pharmacy_id='$X'),
 'products',(select coalesce(json_agg(c),'[]') from cd_products c where id in (select product_id from cd_registers where pharmacy_id='$X')),
 'registers',(select coalesce(json_agg(r),'[]') from cd_registers r where pharmacy_id='$X'),
 'entries',(select coalesce(json_agg(e order by e.seq),'[]') from cd_entries e where register_id in (select id from cd_registers where pharmacy_id='$X')),
 'stock_checks',(select coalesce(json_agg(t),'[]') from stock_checks t where pharmacy_id='$X'),
 'quarantine_items',(select coalesce(json_agg(t),'[]') from quarantine_items t where pharmacy_id='$X'),
 'destruction_book',(select coalesce(json_agg(t),'[]') from destruction_book t where pharmacy_id='$X'),
 'patients',(select coalesce(json_agg(t),'[]') from patients t where pharmacy_id='$X'),
 'contacts',(select coalesce(json_agg(t),'[]') from contacts t where pharmacy_id='$X'),
 'dispense_reminders',(select coalesce(json_agg(t),'[]') from dispense_reminders t where pharmacy_id='$X'),
 'notes',(select coalesce(json_agg(t),'[]') from notes t where pharmacy_id='$X'),
 'note_attachments',(select coalesce(json_agg(t),'[]') from note_attachments t where pharmacy_id='$X'),
 'audit_log',(select coalesce(json_agg(to_jsonb(t) || jsonb_build_object('details_raw', t.details::text) order by t.chain_seq),'[]') from audit_log t where pharmacy_id='$X'))"
$P -At -c "$EXPORT" > "$DIR/backup.json"
FP="select (select string_agg(row_hash, ',' order by register_id, seq) from cd_entries where register_id in (select id from cd_registers where pharmacy_id='$X')) || '|' || (select string_agg(row_hash, ',' order by chain_seq) from audit_log where pharmacy_id='$X')"
before=$($P -At -c "$FP")
lines=$($P -At -c "select count(*) from cd_entries where register_id in (select id from cd_registers where pharmacy_id='$X')")
WIPE="set session_replication_role = replica;
 delete from note_attachments where pharmacy_id='$X'; delete from notes where pharmacy_id='$X'; delete from dispense_reminders where pharmacy_id='$X';
 delete from contacts where pharmacy_id='$X'; delete from destruction_book where pharmacy_id='$X'; delete from quarantine_items where pharmacy_id='$X';
 delete from stock_checks where pharmacy_id='$X'; delete from cd_entries where register_id in (select id from cd_registers where pharmacy_id='$X');
 delete from patients where pharmacy_id='$X'; delete from cd_registers where pharmacy_id='$X'; delete from audit_log where pharmacy_id='$X';
 delete from pharmacy_accounts where pharmacy_id='$X'; delete from staff where pharmacy_id='$X'; delete from pharmacies where id='$X';"
$P -c "$WIPE" >/dev/null

# A tampered backup (one quantity changed) must be refused, leaving nothing behind
python3 -c "
import json,sys; b=json.load(open('$DIR/backup.json')); b['entries'][-1]['quantity']=str(float(b['entries'][-1]['quantity'])+1); json.dump(b,open('$DIR/tampered.json','w'))"
node scripts/restore-backup.mjs "$DIR/tampered.json" --out "$DIR/tampered.sql" >/dev/null
if $P -f "$DIR/tampered.sql" >/dev/null 2>"$DIR/terr"; then no 'a tampered backup was restored'; else
  grep -q 'failed its integrity check' "$DIR/terr" && [ "$($P -At -c "select count(*) from pharmacies where id='$X'")" = 0 ] && ok 'a tampered backup is refused and nothing is left behind' || { no 'tampered backup: wrong failure'; head -3 "$DIR/terr"; }
fi

# Password-protected backup (encrypted with the browser code): wrong password refused, right one restores
npx tsx tests/db/encrypt-backup.mts "$DIR/backup.json" "$DIR/protected.json" 'correct horse battery'
! grep -q 'Mary' "$DIR/protected.json" && ok 'protected backup: no patient details readable in the file' || no 'protected backup readable'
CDREG_BACKUP_PASSWORD='wrong password!' node scripts/restore-backup.mjs "$DIR/protected.json" --out "$DIR/x.sql" >/dev/null 2>"$DIR/perr" && no 'wrong password accepted' || { grep -q 'Wrong password' "$DIR/perr" && ok 'protected backup: wrong password refused' || no 'wrong password: wrong message'; }
CDREG_BACKUP_PASSWORD='correct horse battery' node scripts/restore-backup.mjs "$DIR/protected.json" --out "$DIR/restore.sql" --login "$U" > "$DIR/rout"
if $P -f "$DIR/restore.sql" >/dev/null 2>"$DIR/rerr"; then ok 'backup restores in one transaction'; else no 'restore failed'; grep -m3 ERROR "$DIR/rerr"; fi
after=$($P -At -c "select (select string_agg(row_hash, ',' order by register_id, seq) from cd_entries where register_id in (select id from cd_registers where pharmacy_id='$X')) || '|' || (select string_agg(row_hash, ',' order by chain_seq) from audit_log where pharmacy_id='$X' and action <> 'data.restored')")
[ -n "$before" ] && [ "$before" = "$after" ] && ok "all $lines register lines and the audit trail have identical fingerprints" || no 'fingerprints differ after restore'
[ "$($P -At -c "select bool_and(ok) from cd_registers g, lateral verify_register_chain(g.id) v where g.pharmacy_id='$X'")" = t ] && [ "$($P -At -c "select ok from verify_audit_chain('$X')")" = t ] && ok 'integrity check passes, including the "restored" audit record' || no 'integrity check after restore'
[ "$($P -At -c "select count(*) from audit_log where pharmacy_id='$X' and action='data.restored'")" = 1 ] && ok 'the restore is recorded in the audit trail' || no 'no data.restored audit record'
[ "$($P -At -c "select count(*) from pharmacy_accounts where pharmacy_id='$X'")" = 1 ] && grep -qE '^  .+: [0-9]{6}$' "$DIR/rout" && [ "$($P -At -c "select count(*) from staff where pharmacy_id='$X' and role='supervising_pharmacist' and pin_hash is not null")" -ge 1 ] && ok 'login linked; supervising pharmacist gets a one-off PIN' || no 'login / one-off PIN'
! grep -qE '^  .+: [0-9]{6}$' "$DIR/restore.sql" && ok 'the one-off PIN is not written into the SQL file' || no 'PIN found in SQL file'
$P -c "update cd_entries set quantity = 1 where register_id in (select id from cd_registers where pharmacy_id='$X')" >/dev/null 2>&1 && no 'append-only guard is off after restore' || ok 'register is append-only again after the restore'
$P -f "$DIR/restore.sql" >/dev/null 2>"$DIR/rerr2" && no 'restored twice' || { grep -q 'already in the database' "$DIR/rerr2" && ok 'restoring the same pharmacy twice is refused' || no 'second restore: wrong failure'; }
