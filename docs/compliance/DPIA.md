# Data Protection Impact Assessment: PharmacyCDReg.ie

> Prepared by the operator to help pharmacies (controllers) complete their own DPIA. Review it yearly, or when the processing changes.

## 1. Processing
**What:** an electronic Controlled Drug Register for Irish community pharmacies. It records receipts, supplies, destructions and corrections of Schedule 2 (and optionally 3) controlled drugs, plus related records:
- patient records;
- reminders;
- notes with photos;
- the destruction record book;
- the audit trail.

**Why:** to meet the Misuse of Drugs Regulations 2017 record-keeping duties more accurately than paper, and to make inspection easier.

**Scale:** per pharmacy, typically a few thousand register lines a year, a few hundred patients, and 2–15 staff.

## 2. Necessity and proportionality
- **Lawful basis:** legal obligation (Art. 6(1)(c)). Health data is processed under Art. 9(2)(h)/(i) and the Data Protection Act 2018 s.52.
- **Data minimisation:** the patient fields are the ones the statutory register needs. Date of birth, GMS and IHI numbers are optional.
- **Accuracy:** every entry is signed by a named pharmacist and checked before signing. Corrections never overwrite the original.
- **Storage limitation:** retained while the pharmacy uses the service. Export and deletion are available on exit, subject to statutory retention.

## 3. Risks and measures
| Risk | Likelihood / severity before | Measures | Residual |
|---|---|---|---|
| Unauthorised access to patient data (stolen password) | Possible / High | TOTP two-step sign-in (can be required), personal PINs, auto-lock, rate limits, audit log of views | Low |
| Insider misuse (staff browsing records) | Possible / Medium | Role permissions, every view and export audited, locum expiry | Low |
| Register falsification (to hide diversion) | Possible / High | Append-only DB triggers, SHA-256 hash chain with verification, weekly off-system fingerprint email, corrections visible | Low |
| Data loss (provider failure, error) | Unlikely / High | Daily provider backups, customer full backups, append-only design, restore runbook | Low |
| Unavailability during dispensing | Possible / Medium | Paper fallback sheet with late-entry flag, health monitoring, EU-region hosting | Low |
| AI reading provider retains or reuses images | Unlikely / High | Google Vertex AI under the Cloud DPA (no training on customer data), scans optional, results are drafts | Low |
| Transfer outside the EEA | Unlikely / Medium | EU hosting for stored data; scans processed in the Vertex AI EU multi-region; SCCs for any non-EEA sub-processor | Low |
| Inspector link leaked | Unlikely / Medium | Time-limited (max 14 days), revocable, read-only, every view audited, token stored only as a hash | Low |
| Breach not detected | Possible / High | Error reporting, server logs, integrity verification, audit trail | Medium (improve with an external monitoring service) |

## 4. Consultation
Pharmacies may consult their staff, and the IPU eCDR conformance criteria were used as the requirements baseline. Prior consultation with the DPC isn't needed, because residual risks are low.

## 5. Sign-off
Operator: ____________________ Date: ________
Pharmacy (controller) DPO / supervising pharmacist: ____________________ Date: ________
