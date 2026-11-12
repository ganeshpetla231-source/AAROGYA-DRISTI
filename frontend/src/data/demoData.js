export const roles = [
  { id: 'patient', name: 'Patient', icon: '♡', home: 'My health' }, { id: 'asha', name: 'ASHA Worker', icon: '✚', home: 'Community' },
  { id: 'doctor', name: 'Medical Officer / Doctor', icon: '⚕', home: 'Clinical overview' }, { id: 'specialist', name: 'Specialist', icon: '✳', home: 'Referrals' },
  { id: 'hospital', name: 'Hospital Staff', icon: '▦', home: 'Facility overview' }, { id: 'district', name: 'District Administrator', icon: '⌖', home: 'District overview' },
  { id: 'admin', name: 'Super Admin', icon: '⚙', home: 'Platform overview' }
];
export const navItems = [
  { id: 'overview', label: 'Overview', icon: '◫' }, { id: 'patients', label: 'Patients', icon: '♡' }, { id: 'appointments', label: 'Appointments', icon: '▣' },
  { id: 'referrals', label: 'Referrals', icon: '↗' }, { id: 'facilities', label: 'Facilities', icon: '⌖' }, { id: 'reports', label: 'Reports & analytics', icon: '▥' }, { id: 'settings', label: 'Settings', icon: '⚙' }
];
export const qrNavItems = {
  patient: [{ id: 'qr-card', label: 'My QR card', icon: '▦' }],
  asha: [{ id: 'qr-scanner', label: 'Scan patient QR', icon: '▦' }, { id: 'qr-history', label: 'QR scan history', icon: '◷' }],
  doctor: [{ id: 'qr-scanner', label: 'Scan patient QR', icon: '▦' }]
};
export const screeningNavItems = {
  patient: [{ id: 'screening-history', label: 'Screening history', icon: '◷' }],
  asha: [{ id: 'screening-upload', label: 'Oral screening', icon: '◉' }, { id: 'screening-history', label: 'Screening history', icon: '◷' }],
  doctor: [{ id: 'screening-review', label: 'Doctor review queue', icon: '✚' }, { id: 'screening-history', label: 'Screening history', icon: '◷' }]
};
export const voiceNavItems = {
  patient: [{ id: 'voice-assistant', label: 'Voice assistant', icon: '♬' }, { id: 'voice-history', label: 'My transcripts', icon: '▤' }],
  asha: [{ id: 'voice-assistant', label: 'Voice assistant', icon: '♬' }, { id: 'voice-history', label: 'Transcripts', icon: '▤' }]
};
export const clinicalNavItems = {
  doctor: [{ id: 'clinical-workspace', label: 'Clinical workspace', icon: '✚' }]
};

export const mapsNavItems = { patient: [{ id: 'maps', label: 'Maps & care locations', icon: 'M' }], asha: [{ id: 'maps', label: 'Maps & care locations', icon: 'M' }], district: [{ id: 'maps', label: 'Maps & care locations', icon: 'M' }] };

export const notificationNavItems = Object.fromEntries(roles.map(role => [role.id, [{ id: 'notifications', label: 'Notifications', icon: '◉' }]]));
export const analyticsNavItems = Object.fromEntries(roles.filter(role => role.id !== 'patient').map(role => [role.id, [{ id: 'analytics', label: 'Analytics', icon: '▥' }]]));
