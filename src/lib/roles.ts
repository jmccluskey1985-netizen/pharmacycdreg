export type StaffRole = 'superintendent_pharmacist' | 'supervising_pharmacist' | 'pharmacist' | 'support_pharmacist' | 'locum_pharmacist' | 'technician' | 'read_only';

export const STAFF_ROLES: StaffRole[] = ['superintendent_pharmacist', 'supervising_pharmacist', 'pharmacist', 'support_pharmacist', 'locum_pharmacist', 'technician', 'read_only'];

export const ROLE_LABELS: Record<StaffRole, string> = {
  superintendent_pharmacist: 'Superintendent pharmacist',
  supervising_pharmacist: 'Supervising pharmacist',
  pharmacist: 'Pharmacist',
  support_pharmacist: 'Support pharmacist',
  locum_pharmacist: 'Locum pharmacist',
  technician: 'Technician',
  read_only: 'Read only (e.g. inspector view)',
};

/** Superintendent and supervising pharmacists run the pharmacy's set-up (staff, settings, books). */
export const isLead = (r: StaffRole) => r === 'superintendent_pharmacist' || r === 'supervising_pharmacist';
/** Every role that is a registered pharmacist and may sign register entries. */
export const isPharmacist = (r: StaffRole) => isLead(r) || r === 'pharmacist' || r === 'support_pharmacist' || r === 'locum_pharmacist';

/** NFR1–NFR3: what each role may do. Register entries are made by pharmacists. */
export const can = {
  record: (r: StaffRole) => isPharmacist(r),
  scan: (r: StaffRole) => r !== 'read_only', // technicians may scan & draft; a pharmacist confirms
  openRegister: (r: StaffRole) => isLead(r) || r === 'pharmacist' || r === 'support_pharmacist',
  manageStaff: (r: StaffRole) => isLead(r),
  viewAudit: (r: StaffRole) => isLead(r) || r === 'pharmacist' || r === 'support_pharmacist' || r === 'read_only',
};
