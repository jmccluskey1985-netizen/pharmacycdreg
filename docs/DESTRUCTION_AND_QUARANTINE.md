# Destruction and quarantine of controlled drugs

How PharmacyCDReg records CD stock that is waiting to be destroyed, and how it records the destruction itself. The software keeps the same two records as the paper system.

> **Source caveat.** This summary is based on PSI guidance on the safe custody and destruction of controlled drugs in retail pharmacy businesses, the Misuse of Drugs Regulations 2017 (S.I. 173/2017) as amended, and IPU summaries of both. psi.ie could not be fetched directly while this was written. Check the current PSI guidance before relying on this for an inspection.

## 1. What the rules say (summary)

| Topic | Rule |
|---|---|
| Expired / damaged **Schedule 2** stock | Doesn't have to be destroyed straight away. Keep it **in the CD safe**, **segregated** from usable stock and **clearly labelled** (e.g. "CDs for destruction — expired"). It stays pharmacy stock, so it **stays in the register balance** until it is destroyed. Arrange destruction **promptly**; don't let it build up. |
| Who must witness Sch 2 stock destruction | An **authorised person** under the Regulations, e.g. a member of Garda personnel, a PSI authorised officer or inspector, or another person authorised by the Minister. A second pharmacist is **not** enough. |
| Where it's recorded | In the **CD register**: the witnessed destruction section. Record the date, drug and amount destroyed, the witness's name and capacity, and the pharmacist's signature. The register balance falls by the amount destroyed. |
| **Patient-returned** CDs (Sch 2, 3, 4) | These were never pharmacy stock, so they **don't go in the CD register** and never touch its balance. Record them in a separate **CD Destruction Record Book**: when received, from whom, what and how much, who received it, and later when it was destroyed and by whom. Store Sch 2/3 returns in the CD safe, segregated, until destroyed. |
| Expired **Schedule 3 / 4** stock | Not entered in the CD register. Record its destruction in the **CD Destruction Record Book**. |
| Witness for patient returns / Sch 3–4 | No authorised person is required. **Good practice** is a second pharmacist or another staff member as witness. |
| Method | Denature so the drug can't be recovered, e.g. with a CD denaturing kit, then dispose of it as pharmaceutical waste. |

## 2. How PharmacyCDReg implements it

### 2.1 Set aside (quarantine): Schedule 2 stock

- **Where:** the drug's register page → **Set aside**.
- **What is recorded:** amount, reason (expired / damaged / recalled / other), optional batch, expiry and notes. The signed-in staff member is recorded too.
- **Table:** `quarantine_items` (migration 0011), with status `awaiting`.
- **Balance:** **unchanged**. The register page shows an amber box: "N set aside for destruction — still in the balance until destroyed". The bookshelf and table views show a "N for destruction" badge.
- **Limits:** you can't set aside more than (balance − amount already set aside).
- **Stock checks:** the count should *include* stock that is set aside, and the stock-check form says so.
- **Release:** if stock was set aside by mistake (e.g. it is in date), **Release** returns it to usable stock. This needs a reason and is audited (`quarantine.released`). The row is kept with status `released`.

### 2.2 Witnessed destruction: Schedule 2 stock (part of the CD register)

- **Where:** **Destructions → Witnessed — Sch 2 stock**.
- **Steps:**
  1. Tick the items under **Awaiting destruction**.
  2. Choose **Record witnessed destruction**.
  3. Enter the date, the authorised witness, their capacity and the method.
- **What it writes:** **one `destruction` entry per register**, for the total amount ticked in that register. The entry carries the witness name, capacity and method, plus notes listing reason, batch and expiry. It goes through the same append-only `cd_entries` table and checks as any other entry, so it can't take the balance below zero, and it is audited.
- **Linking:** each quarantine item is marked `destroyed` and linked to its entry (`destroyed_entry_id`).
- **The record itself:** the **Witnessed Destruction Record** table below is the destruction section of the register. It is printable.
- **Direct destruction:** a destruction can still be entered straight from a register page (New entry → Destroyed) without setting stock aside first.

### 2.3 CD Destruction Record Book: patient returns and Sch 3/4 stock

- **Where:** **Destructions → Destruction Record Book**. The New entry → **Patient return** option opens it directly (`?tab=book&new=return`).
- **Table:** `destruction_book` (migration 0011). It is **separate from every register**, so nothing here changes a register balance.
- **Patient return:** record who returned it (name, address), the drug as written, the amount, unit, schedule (2–4), date received, and optional batch, expiry and notes. **Received by** is the signed-in staff member.
- **Expired Sch 3/4 stock:** the same form, without "returned by".
- **Destruction:**
  1. Tick the rows still awaiting destruction.
  2. Choose **Record destruction**.
  3. Enter the date and method, plus an optional (recommended) witness and their capacity.
  - **Destroyed by** is the signed-in staff member.
- **Guards** (database triggers):
  - No delete.
  - The received fields are immutable.
  - The destruction fields can be set **once** only, and need a date and a person.
- **Legacy entries:** patient-return entry types that were recorded *inside* registers before this change still display there. New ones can no longer be added to a register.

## 3. Data model (migration 0011)

```
quarantine_items   register_id, quantity, reason, batch, expiry_date, notes,
                   status (awaiting | destroyed | released),
                   created_by_staff_id, destroyed_entry_id → cd_entries,
                   resolved_by_staff_id, resolved_at, release_reason
                   guard: no delete; closed rows final; core fields immutable

destruction_book   kind (patient_return | stock_sch34), drug, schedule, quantity, unit,
                   batch, expiry_date, returned_by_name/address,
                   received_date, received_by_staff_id/name, notes,
                   destroyed_date, destroyed_by_staff_id/name,
                   witness_name/role, destruction_method
                   guard: no delete; received fields immutable; destruction set once
```

## 4. API

| Route | Purpose |
|---|---|
| `GET /api/quarantine[?register_id=]` | Items with label and unit; `needs_migration` if 0011 hasn't run |
| `POST /api/quarantine` | Set stock aside (checked against available balance) |
| `PATCH /api/quarantine/:id` | Release, with a reason |
| `POST /api/quarantine/destroy` | `{ids, transaction_date, witness_name, witness_role, destruction_method}` → one destruction entry per register |
| `GET/POST /api/destruction-book` | List / add a row |
| `POST /api/destruction-book/destroy` | `{ids, destroyed_date, witness_name?, witness_role?, destruction_method?}` |

All write routes need a signed-in staff member with the `record` permission and an account that can write (trial, active or complimentary). All of them are audited.
