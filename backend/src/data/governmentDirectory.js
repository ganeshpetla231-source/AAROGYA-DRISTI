const district = 'Alluri Sitharama Raju';

const hospitals = [
  { directoryKey: 'itda-paderu:hospital:district-paderu', name: 'District Hospital, Paderu', facilityType: 'District Hospital', beds: 200, village: 'Paderu', mandal: 'Paderu', district, address: 'Paderu, Alluri Sitharama Raju District, Andhra Pradesh', services: ['Government hospital'] },
  { directoryKey: 'itda-paderu:hospital:area-araku-valley', name: 'Area Hospital, Araku Valley', facilityType: 'Area Hospital', beds: 150, village: 'Araku Valley', mandal: 'Araku Valley', district, address: 'Araku Valley, Alluri Sitharama Raju District, Andhra Pradesh', services: ['Government hospital'] },
  { directoryKey: 'itda-paderu:hospital:chc-chintapalli', name: 'CHC Chintapalli', facilityType: 'Community Health Centre', beds: 50, village: 'Chintapalli', mandal: 'Chintapalli', district, address: 'Chintapalli, Alluri Sitharama Raju District, Andhra Pradesh', services: ['Community Health Centre'] },
  { directoryKey: 'itda-paderu:hospital:chc-munchingiputtu', name: 'CHC Munchingiputtu', facilityType: 'Community Health Centre', beds: 30, village: 'Munchingiputtu', mandal: 'Munchingiputtu', district, address: 'Munchingiputtu, Alluri Sitharama Raju District, Andhra Pradesh', services: ['Community Health Centre'] }
];

const phcRows = [
  ['Ananthagiri', 'Ananthagiri', '531145', '7382798216'], ['Ananthagiri', 'Bheemavaram', '531145', '9493338682'], ['Ananthagiri', 'Lungaparthi', '535145', '8331028190'], ['Ananthagiri', 'Pinakota', '531030', '8331028471'],
  ['Araku Valley', 'Gannela', '531149', '9493778432'], ['Araku Valley', 'Madagada', '535149', '9493203816'], ['Araku Valley', 'Sunkarametta', '531149', '8985868769'],
  ['Chintapalli', 'Korukonda', '531111', '9492615031'], ['Chintapalli', 'Lambasingi', '531111', '9440209863'], ['Chintapalli', 'Lothugedda', '531111', '9247413118'], ['Chintapalli', 'Tajangi', '531118', '9493602405'],
  ['Dumbriguda', 'Dumbriguda', '531149', '9642930354'], ['Dumbriguda', 'Killoguda', '531149', '9491541167'],
  ['G. Madugula', 'Gemmili', '531029', '9505556224'], ['G. Madugula', 'G. Madugula', '531029', '9000827044'],
  ['G.K. Veedhi', 'Darakonda', '531105', '9985490143'], ['G.K. Veedhi', 'G.K. Veedhi', '531133', '7093370008'], ['G.K. Veedhi', 'Jerrila', '531111', '9495675986'], ['G.K. Veedhi', 'Pedavalasa', '531133', '9492615031'], ['G.K. Veedhi', 'Raghavendra Nagar', '531133', '8330931867'], ['G.K. Veedhi', 'Sapparla', '531133', '9441482778'], ['G.K. Veedhi', 'Sileru', '531105', '8978984444'],
  ['Hukumpeta', 'Hukumpeta', '531077', '7382552102'], ['Hukumpeta', 'Uppa', '531077', '8331028791'],
  ['Koyyuru', 'Downooru', '531118', '7730860637'], ['Koyyuru', 'Kantaram', '531084', '8331846954'], ['Koyyuru', 'Rajendrapalem', '531087', '8331028663'], ['Koyyuru', 'U. Cheedipalem', '531087', '8331028693'],
  ['Munchingiputtu', 'Kilagada', '531040', '9441530610'], ['Munchingiputtu', 'Labburu', '531040', '9491779571'],
  ['Paderu', 'Edulapalem', '531024', '9490035458'], ['Paderu', 'Minumuluru', '531024', '8331028768'],
  ['Pedabayalu', 'Gomangi', '531040', '8919677040'], ['Pedabayalu', 'Pedabayalu', '531040', '8331028543'], ['Pedabayalu', 'Rudakota', '531040', '8331028553']
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const phcs = phcRows.map(([mandal, name, postalCode, phone]) => ({
  directoryKey: `itda-paderu:phc:${slug(mandal)}:${slug(name)}`,
  name,
  facilityType: 'Primary Health Centre',
  village: name,
  mandal,
  district,
  postalCode,
  phone: String(phone),
  address: `${name}, ${mandal}, ${district} District, Andhra Pradesh ${postalCode}`,
  services: ['Primary Health Centre']
}));

const dmho = {
  name: 'DMHO – Alluri Sitharama Raju District',
  phone: '9959055025',
  email: 'dmhoasr@gmail.com'
};

module.exports = { hospitals, phcs, dmho, district };
