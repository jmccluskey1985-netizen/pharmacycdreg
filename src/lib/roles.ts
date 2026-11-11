export type StaffRole = 'supervising_pharmacist' | 'pharmacist' | 'locum_pharmacist' | 'technician' | 'read_only';

export const ROLE_LABELS: Record<StaffRole, string> = {
  supervising_pharmacist: 'Supervising pharmacist',
  pharmacist: 'Pharmacist',
  locum_pharmacist: 'Locum pharmacist',
  technician: 'Technician',
  read_only: 'Read only (e.g. inspector view)',
};

/** NFR1–NFR3: what each role may do. Register entries are made by pharmacists. */
export const can = {
  record: (r: StaffRole) => r === 'supervising_pharmacist' || r === 'pharmacist' || r === 'locum_pharmacist',
  scan: (r: StaffRole) => r !== 'read_only', // technicians may scan & draft; a pharmacist confirms
  openRegister: (r: StaffRole) => r === 'supervising_pharmacist' || r === 'pharmacist',
  manageStaff: (r: StaffRole) => r === 'supervising_pharmacist',
  viewAudit: (r: StaffRole) => r === 'supervising_pharmacist' || r === 'pharmacist' || r === 'read_only',
};
