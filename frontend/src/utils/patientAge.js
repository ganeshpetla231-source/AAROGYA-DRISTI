export function indiaTodayDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

export function patientAgeFromDateOfBirth(value, today = new Date()) {
  if (value instanceof Date && Number.isNaN(value.getTime())) return null;
  const birthDate = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;

  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return null;
  const todayDate = indiaTodayDate(today);
  if (birthDate > todayDate) return null;

  const [todayYear, todayMonth, todayDay] = todayDate.split('-').map(Number);
  let age = todayYear - birth.getUTCFullYear();
  const birthdayHasPassed = todayMonth > birth.getUTCMonth() + 1
    || (todayMonth === birth.getUTCMonth() + 1 && todayDay >= birth.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age >= 0 ? age : null;
}
