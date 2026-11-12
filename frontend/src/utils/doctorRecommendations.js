const specialtyTermsByCategory = {
  'possible-gingivitis': ['periodont', 'dentist', 'dental', 'oral health', 'oral medicine'],
  'possible-thrush': ['oral medicine', 'oral path', 'dentist', 'dental', 'oral health'],
  'possible-infection': ['oral medicine', 'oral path', 'dentist', 'dental', 'oral health'],
  'possible-ulcer': ['oral medicine', 'oral path', 'maxillofacial', 'dentist', 'dental', 'oral health'],
  'possible-white-patch': ['oral medicine', 'oral path', 'maxillofacial', 'dentist', 'dental', 'oral health'],
  'possible-red-lesion': ['oral medicine', 'oral path', 'maxillofacial', 'dentist', 'dental', 'oral health'],
  'other-abnormality': ['oral medicine', 'oral path', 'maxillofacial', 'dentist', 'dental', 'oral health'],
  'no-visible-abnormality': ['dentist', 'dental', 'oral health', 'oral medicine']
};

function providerSpecialtyText(provider) {
  const profile = provider.profile || provider.doctorProfile || {};
  return [profile.specialization, ...(profile.expertise || [])].filter(Boolean).join(' ').toLowerCase();
}

export function recommendDoctors(category, providers, limit = 3) {
  if (category === 'insufficient-quality') return { matched: false, doctors: [] };

  const terms = specialtyTermsByCategory[category] || specialtyTermsByCategory['other-abnormality'];
  const sortedProviders = [...providers].sort((a, b) => a.name.localeCompare(b.name));
  const matchedProviders = sortedProviders.map(provider => {
    const specialtyText = providerSpecialtyText(provider);
    const priority = terms.findIndex(term => specialtyText.includes(term));
    return { provider, priority };
  }).filter(item => item.priority !== -1)
    .sort((a, b) => a.priority - b.priority || a.provider.name.localeCompare(b.provider.name))
    .map(item => item.provider);

  return {
    matched: matchedProviders.length > 0,
    doctors: (matchedProviders.length ? matchedProviders : sortedProviders).slice(0, limit)
  };
}
