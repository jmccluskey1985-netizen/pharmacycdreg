# Sub-processor DPAs: what to sign, and where

Keep a copy of each (PDF, plus the date you accepted it) in your compliance folder. They're evidence for the IPU pack and for any pharmacy that asks. Links change, so confirm on each provider's site.

| Provider | Handles | How the DPA applies | Action |
|---|---|---|---|
| **Supabase** (database, files) | All register and patient data | Published DPA at supabase.com/legal/dpa. A countersigned copy can be requested in the dashboard (Organization → Documents), which sends a PandaDoc to sign | Request and sign it in the dashboard; save the PDF |
| **Vercel** (hosting) | Everything passing through the app | DPA is incorporated into the Vercel terms (vercel.com/legal/dpa) | Download and save it |
| **Google Cloud** (Vertex AI, scans) | Prescription and invoice photos, while being read | Cloud Data Processing Addendum. Accept it in the Cloud console (Account / Legal & compliance). Customer data isn't used to train models | Accept it; set the reader to the EU location |
| **Google Workspace** (email) | Service emails (no patient data) | Cloud Data Processing Addendum in the Admin console → Account → Legal and compliance | Accept it |
| **Stripe** (billing) | Billing contacts (no patient data) | Stripe's DPA is part of the Stripe Services Agreement | Nothing to sign; save a copy |
| **OpenRouter** *(only if switched back to it)* | Scan photos | Self-serve users can only view the DPA. A mutually signed DPA needs an Enterprise plan (trust.openrouter.ai). Its DPA asks customers to restrict sensitive data unless agreed | Avoid for health data; use Google Vertex AI |

## Also
- Record each provider's region: Supabase EU project, Vercel `dub1`, Vertex `eu`.
- Review this list yearly, and whenever a provider is added or changed. Update `/privacy` (src/config/company.ts → `SUBPROCESSORS`). Give customers 30 days' notice of a new sub-processor of register data (DPA clause 5).
