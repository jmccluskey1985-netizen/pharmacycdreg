import { isLead, isPharmacist, type StaffRole } from './roles';

/**
 * What each role may do, chosen per pharmacy by the superintendent or supervising pharmacist
 * (Settings → Roles & permissions). Defaults below; a pharmacy's choices are stored in
 * pharmacies.permissions as { role: { permission: boolean } }.
 *
 * Fixed, never configurable (shown greyed out):
 * - Superintendent and supervising pharmacists can always do everything, so no one is locked out.
 * - Signing register entries is for pharmacists only (the register is signed by a pharmacist).
 * - Read-only users can only view.
 */
export const PERMISSIONS = [
  { key: 'draftEntries', label: 'Draft register entries', text: 'Prepare receipts and supplies for a pharmacist to check and sign. Drafts don’t change any balance until signed.' },
  { key: 'scan', label: 'Scan prescriptions, invoices and reports', text: 'Read documents into drafts. A pharmacist still signs.' },
  { key: 'openRegister', label: 'Open new CD books', text: 'Start a register for a new product, with its balance brought forward.' },
  { key: 'stockCheck', label: 'Record stock checks', text: 'Count stock against the balance and check a dispensing report. Amending a balance stays pharmacist-only.' },
  { key: 'patients', label: 'Manage patients, doctors and suppliers', text: 'Add and edit records used to fill in entries, including the OST patient list.' },
  { key: 'reminders', label: 'Manage dispensing reminders', text: 'Set up and edit reminders for regular supplies.' },
  { key: 'viewAudit', label: 'View the audit trail', text: 'See who did what, and verify integrity.' },
] as const;
export type Permission = (typeof PERMISSIONS)[number]['key'];
export type PermissionOverrides = Partial<Record<StaffRole, Partial<Record<Permission, boolean>>>>;

/** Roles whose permissions can be changed (leads always have everything; read-only can't be given actions). */
export const CONFIGURABLE_ROLES: StaffRole[] = ['pharmacist', 'support_pharmacist', 'locum_pharmacist', 'technician'];

const DEFAULTS: Record<Permission, (r: StaffRole) => boolean> = {
  draftEntries: (r) => r === 'technician',
  scan: (r) => r !== 'read_only',
  openRegister: (r) => isLead(r) || r === 'pharmacist' || r === 'support_pharmacist',
  stockCheck: (r) => isPharmacist(r) || r === 'technician',
  patients: (r) => isPharmacist(r) || r === 'technician',
  reminders: (r) => isPharmacist(r),
  viewAudit: (r) => isLead(r) || r === 'pharmacist' || r === 'support_pharmacist' || r === 'read_only',
};

/** Whether a permission can be switched for a role (false = fixed, shown greyed out). */
export function isConfigurable(role: StaffRole, perm: Permission) {
  if (!CONFIGURABLE_ROLES.includes(role)) return false;
  // Pharmacists sign entries directly, so drafting doesn't apply to them
  if (perm === 'draftEntries' && isPharmacist(role)) return false;
  return true;
}

export function permits(role: StaffRole, perm: Permission, overrides?: PermissionOverrides | null): boolean {
  if (isLead(role)) return true;
  if (role === 'read_only') return perm === 'viewAudit' ? (overrides?.read_only?.viewAudit ?? true) : false;
  if (perm === 'draftEntries' && isPharmacist(role)) return false; // they sign directly
  const o = overrides?.[role]?.[perm];
  return typeof o === 'boolean' && isConfigurable(role, perm) ? o : DEFAULTS[perm](role);
}

/** Keep only valid, configurable switches (what the settings API saves). */
export function cleanOverrides(input: unknown): PermissionOverrides {
  const out: PermissionOverrides = {};
  if (!input || typeof input !== 'object') return out;
  for (const role of CONFIGURABLE_ROLES) {
    const r = (input as any)[role];
    if (!r || typeof r !== 'object') continue;
    for (const { key } of PERMISSIONS) {
      if (typeof r[key] === 'boolean' && isConfigurable(role, key)) (out[role] ||= {})[key] = r[key];
    }
  }
  return out;
}
