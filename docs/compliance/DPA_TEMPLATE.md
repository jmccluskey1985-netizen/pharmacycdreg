# Data Processing Agreement (template)

> **Template — have it reviewed by a solicitor before use.** Fill in the bracketed items. It's written to GDPR Article 28.

**Between** [Pharmacy legal name], [address], PSI premises no. [ ] (the **Controller**)
**and** [Operator legal name], [address], trading as PharmacyCDReg.ie (the **Processor**).

## 1. Subject matter and duration
The Processor provides the PharmacyCDReg.ie electronic Controlled Drug Register service under the Terms of Service. This agreement lasts as long as the service is provided, plus any period needed to return or delete data under clause 9.

## 2. Nature and purpose of processing
- Hosting, storing, displaying, exporting and backing up the Controller's Controlled Drug register records and related records:
  - destruction records;
  - patient records;
  - notes and attachments;
  - dispensing reminders;
  - audit trail.
- Reading photos of prescriptions and invoices with an AI model, but only when a user chooses to scan.
- Sending service emails.

## 3. Categories of data and data subjects
| Data subjects | Data |
|---|---|
| Patients and their representatives | Name, address, date of birth (optional), GMS/IHI number (optional), medicines supplied, prescription references, collection details |
| Prescribers | Name, address, registration number |
| Pharmacy staff | Name, PSI number, role, activity in the audit trail |
| Suppliers and witnesses | Name, address, capacity |

This includes **special category (health) data** under Article 9.

## 4. Processor obligations
The Processor will:
1. process personal data only on the Controller's documented instructions (the service as configured, and this agreement), unless EU or Irish law requires otherwise;
2. ensure that anyone authorised to process the data is bound by confidentiality;
3. implement the security measures in Annex A (Art. 32);
4. use sub-processors only as described in clause 5;
5. assist the Controller in responding to data subject requests (Arts. 12–22), using the export and search features and direct support;
6. assist with Arts. 32–36: security, breach notification, DPIAs and prior consultation;
7. notify the Controller **without undue delay, and in any case within 48 hours**, after becoming aware of a personal data breach, with the information in Art. 33(3) as it becomes available;
8. make available the information needed to demonstrate compliance, and allow for and contribute to audits on reasonable notice.

## 5. Sub-processors
- The Controller gives general authorisation for the sub-processors listed at pharmacycdreg.ie/privacy.
- The Processor will give at least **30 days' notice** of a new sub-processor that handles register data. The Controller may object on reasonable grounds and, if the objection can't be resolved, terminate without penalty.
- The Processor imposes the same data protection obligations on each sub-processor and remains liable for them.

## 6. International transfers
- Register data is stored in the EU.
- Document reading (scans) uses Google Vertex AI in the EU multi-region, so the photos are processed in the EU.
- Where any sub-processor is established outside the EEA, transfers rely on the EU Standard Contractual Clauses and supplementary measures.

## 7. Controller obligations
The Controller:
- ensures it has a lawful basis for the processing;
- keeps staff access (PINs, roles, locum end dates) current;
- remains responsible for the accuracy of register entries and for its obligations under the Misuse of Drugs Regulations.

## 8. Retention
- Register records are retained for as long as the Controller's account exists.
- The Processor never deletes register entries during the term. The register is append-only by design.

## 9. End of service
- On termination the Processor will, at the Controller's choice, return all personal data in a standard format (full JSON backup plus CSV registers), delete it, or both.
- Deletion follows the retention period the Controller specifies, which must be at least the statutory retention period for CD registers.
- Backup copies expire within [35] days of deletion from the live system.

## Annex A — Technical and organisational measures
- **Hosting:** EU database (Supabase) and app servers pinned to Dublin (Vercel `dub1`).
- **Encryption:** TLS 1.2+ with HSTS in transit. Provider encryption at rest. Stored API keys are additionally encrypted with AES-256-GCM.
- **Access control:**
  - Pharmacy login with optional or required TOTP two-step sign-in.
  - Personal staff PINs, stored as bcrypt hashes and limited to 5 attempts per minute.
  - Role-based permissions.
  - Automatic screen lock.
  - Time-limited locum access.
  - Revocable, time-limited read-only inspector links.
- **Isolation:** row-level security with no client access. Every request is checked server-side against the pharmacy and staff session.
- **Integrity:**
  - Append-only register and audit trail, enforced by database triggers.
  - SHA-256 hash chain per register and per audit trail, with an in-app verification tool and a weekly emailed fingerprint record.
- **Logging:** audit of entries, views, exports, sign-ins, failed PINs and setting changes.
- **Availability:**
  - Daily provider backups.
  - Customer-downloadable full backups.
  - A paper fallback procedure.
  - Health endpoint monitoring.
- **AI reading:**
  - Google Vertex AI in the EU multi-region, under the Cloud Data Processing Addendum.
  - Customer data isn't used for model training.
  - Results are drafts until a pharmacist signs them.
- **People:** confidentiality obligations; least-privilege access to production systems.

Signed for the Controller: ____________________  Date: ________
Signed for the Processor: ____________________  Date: ________
