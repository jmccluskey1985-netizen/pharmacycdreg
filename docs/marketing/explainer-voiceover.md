# PharmacyCDReg.ie: 2-minute explainer voiceover

About 200 spoken words in 2 minutes. That leaves room for **silent beats**, where the animation plays with music only and the design does the explaining. Silent beats are marked **[music only]**.

Tone: warm, calm, plain Irish English. One voice. Light music under, lifting slightly in the silent beats.

Security reassurance comes in short lines at the three moments a pharmacist would worry: when a photo is read, when a record could be changed, and just before the sign-off.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Close-up of a worn paper CD register, a pen, a pharmacist sighing at closing time | Six o'clock. Shop's closed. / And you're still balancing the CD register by hand. |
| 0:08–0:16 | Logo reveal, then the register book cover opening (hero animation) | Meet PharmacyCDReg.ie: / the electronic CD register built for Irish pharmacies. |
| 0:16–0:22 | Register page fills the screen, looking just like the paper book | **[music only]** |
| 0:22–0:36 | Invoice / prescription scan animation turning into draft entries | Snap an invoice or a prescription. / The entries are drafted for you. You check, and save. |
| 0:36–0:42 | Scan animation finishes; small padlock + "Read in the EU" badge | Photos are read securely in the EU, and never used to train AI. |
| 0:42–0:54 | Register line anatomy, then the tamper-chain animation | Every entry is permanent. Corrections are added, never overwritten. / So your record stands up to any inspection. |
| 0:54–1:02 | MPS report, Touchstore report, QRP / CSV files dropping in | Upload your MPS or Touchstore report… |
| 1:02–1:10 | Rows tick "In book", two turn amber "Missing" | **[music only]** |
| 1:10–1:14 | Missing lines highlighted | …and anything missing, in any book, is found for you. |
| 1:14–1:20 | Stock count animation: counts typed in, green 0s, one red −2 | Count your stock on screen. |
| 1:20–1:30 | Rows tick "Logged", then the green "Balance confirmed correct" line slides into the register | **[music only]** |
| 1:30–1:40 | Risk assessment filling itself in, then the one-click signature | Your risk assessment? / Already filled in. Just sign. |
| 1:40–1:50 | Phone mock-up, staff PIN pad, security badges (EU hosting, encryption, two-step sign-in) | Every staff member has their own PIN. / Your data is encrypted and stays in the EU, / and it's always yours to download. |
| 1:50–2:00 | Pricing card (€19 a month, first month free), then the web address | First month free, then €19 a month. / PharmacyCDReg.ie. / Less paperwork. More time for patients. |

## Why the silent beats

- **0:16 (the book):** pharmacists recognise the page layout instantly, so no words are needed.
- **1:02 (report matching):** the ticks and the amber "Missing" rows tell the story faster than words.
- **1:20 (logged into the book):** seeing the green line drop into the register is the payoff.

Keep each silent beat at least 4 seconds so it lands.

## Optional lines (swap in if you cut a scene)

- **OST:** "Methadone instalments? Recorded straight from the prescription."
- **Training:** "New staff can practise on a training copy that's wiped when they're done."
- **Inspector:** "Give an inspector a secure, read-only link."

## Short cuts

- **30 seconds:** 0:08 → 0:22 → 0:36 → 1:14 → 1:20 (silent) → 1:50.
- **15-second social clip:** "Your CD register, without the paperwork. Snap it, check it, count it. Secure and hosted in the EU. PharmacyCDReg.ie. First month free."

## Wording rules

- **Security claims** must match the Security page (`/security`). Allowed: hosted in the EU; servers in Dublin; encrypted at rest; own PIN per staff member; two-step sign-in; photos read by Google Cloud in the EU and not used for training; download your data any time.
- **Don't say "backed up daily"** until Supabase Pro is switched on.
- **No absolute claims:** don't say "100% secure", "unhackable" or "GDPR certified".
- **IPU and PSI:** don't say "IPU approved", "certified" or "endorsed", and don't say the PSI or IPU "requires" this product.
- **Fictional details:** every name and figure on screen must be fictional. Keep the demos' sample-data notice visible.
