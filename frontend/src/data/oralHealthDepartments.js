export const oralHealthDepartments = [
  { name: 'General Dentistry', specialties: ['General Dentistry', 'Preventive Dentistry'] },
  { name: 'Oral Medicine and Radiology', specialties: ['Oral Medicine', 'Oral and Maxillofacial Radiology'] },
  { name: 'Oral and Maxillofacial Surgery', specialties: ['Oral and Maxillofacial Surgery'] },
  { name: 'Conservative Dentistry and Endodontics', specialties: ['Conservative Dentistry', 'Endodontics'] },
  { name: 'Periodontology', specialties: ['Periodontology'] },
  { name: 'Orthodontics and Dentofacial Orthopaedics', specialties: ['Orthodontics and Dentofacial Orthopaedics'] },
  { name: 'Prosthodontics and Crown and Bridge', specialties: ['Prosthodontics and Crown and Bridge'] },
  { name: 'Pediatric and Preventive Dentistry', specialties: ['Pediatric and Preventive Dentistry'] },
  { name: 'Oral Pathology and Microbiology', specialties: ['Oral Pathology and Microbiology'] },
  { name: 'Public Health Dentistry', specialties: ['Public Health Dentistry'] }
];

export const oralHealthSpecialties = [...new Set(oralHealthDepartments.flatMap(department => department.specialties))];

export function departmentForSpecialty(specialty) {
  return oralHealthDepartments.find(department => department.specialties.some(
    value => value.toLowerCase() === specialty?.trim().toLowerCase()
  ))?.name || '';
}

export function specialtiesForDepartment(name) {
  return oralHealthDepartments.find(department => department.name === name)?.specialties || [];
}
