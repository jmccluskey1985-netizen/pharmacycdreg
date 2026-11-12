-- Brand per CD product (e.g. OxyNorm vs Shortec capsules). Oxycodone and other CDs are
-- prescribed and dispensed by brand, so the brand leads on the register page; the generic
-- name stays as the class of drug. Optional: older products fall back to the CD list.
alter table cd_products add column if not exists brand text;
