# Connecting Halo to PharmacyCDReg

When a controlled drug (CD) is dispensed in Halo (**Add patient** / **Submit**, label printed), Halo sends the supply to PharmacyCDReg. It then appears under **To confirm** for a pharmacist to sign, or goes straight into the register if **auto-post** is on.

## PharmacyCDReg side (already built)
1. Log in as the supervising pharmacist, go to **Halo connection**, then **Create key**. Copy the key; it's shown only once.
2. Leave **auto-post off** until you're happy Halo's data comes through correctly.
3. Make sure each pharmacist on the **Team** page has their PSI number. Auto-post matches the dispensing pharmacist by PSI number.

## Halo side (to add in Halo)

**When:** right after a dispensing is saved (Add patient / Submit), **for CD items only**: Schedule 2 at minimum, and Schedules 3 and 4 if you keep registers for them. Ignore every non-CD item.

**Request:**
```
POST https://pharmacycdreg.ie/api/integrations/dispensings
Authorization: Bearer <key from the Halo connection page>
Content-Type: application/json
```
Send one request per dispensed CD item:
```json
{
  "external_id": "HALO-ITEM-102938",
  "dispensed_at": "2026-11-12T14:05:00+00:00",
  "drug": { "name": "Oxycodone hydrochloride", "strength": "5mg", "form": "capsule" },
  "quantity": 28,
  "patient": { "name": "Mary Kelly", "address": "14 Main St, Ennis" },
  "prescriber": { "name": "Dr A. Walsh", "address": "Ennis Medical Centre", "registration": "012345" },
  "prescription_ref": "GMS 88213",
  "collected_by": "Patient",
  "collector_id_checked": true,
  "pharmacist": { "psi_number": "12345", "name": "Aoife Byrne" }
}
```

| Field | Required | Notes |
|---|---|---|
| `external_id` | yes | Halo's **unique, stable** id for this dispensed item. Re-sending the same id is safe; it's recorded once. |
| `action` | no | `"dispense"` (default) or `"reverse"` when an item is un-dispensed or deleted in Halo. A reverse shows under To confirm so a pharmacist records a correction; it never silently changes the register. |
| `dispensed_at` | yes | ISO date or datetime |
| `drug.name` / `drug.strength` / `drug.form` | name + strength | Use the generic name if Halo has it. It's matched to the register by name + strength (+ form). |
| `quantity` | yes | Total **base units** supplied (tablets, capsules, ml, patches), not packs. |
| `patient.name` / `patient.address` | yes | Both required in the CD register. |
| `prescriber.*`, `prescription_ref` | recommended | Fills the "authority to be in possession" column. |
| `pharmacist.psi_number` | needed for auto-post | The pharmacist who dispensed or checked the item. |

**Responses:**
- `200 {"status":"posted","entry_id":…,"line":…}`: recorded in the register (auto-post).
- `202 {"status":"pending","problem":…}`: waiting under To confirm, with the reason if there is one.
- `200 {…,"duplicate":true}`: already received earlier; nothing new created.
- `400`: invalid body. Log it and show a warning in Halo.
- `401`: bad or revoked key.
- `429` or `5xx`: **retry later**.

**Reliability (important):** never lose a CD supply because the internet blipped.
- Write each CD item to a small local **outbox** (a file or table in Halo) first.
- Send from the outbox in the background, retrying with back-off until you get `200` or `202`.
- Mark an item as sent only after a 200 or 202. Because `external_id` makes sending idempotent, retries never double-record.
- Don't block the dispensing screen while sending.
- Show a small status indicator in Halo, e.g. "CD register: 2 waiting to send".
- Don't log patient names or addresses in plain-text log files.

## Rolling out
1. Create a key, keep auto-post off, and dispense a few CDs as normal.
2. Check each one under **To confirm**: drug, quantity, patient, prescriber. Sign them.
3. When it reliably matches, turn on **auto-post**. Items with any problem (unknown drug, PSI not on Team, stock would go negative) still wait under To confirm.
