// Telefoonnummers als sleutel voor nummerherkenning (FO §5.1).
// Opslag: alleen cijfers in internationaal formaat zonder '+' (zoals Supabase Auth),
// bijv. 31612345678. Gelijk aan normalize_phone() in de database.

export function normalizePhone(input: string, defaultCountry = '31'): string {
  let s = input.trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('0')) s = defaultCountry + s.slice(1);
  return s.replace(/\D/g, '');
}

export function isValidPhone(input: string): boolean {
  const n = normalizePhone(input);
  return /^[1-9]\d{8,14}$/.test(n);
}

/** E.164 met '+', voor Supabase Auth. */
export function toE164(input: string): string {
  return '+' + normalizePhone(input);
}

export function formatPhone(digits: string): string {
  if (digits.startsWith('316') && digits.length === 11) {
    return `+31 6 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return '+' + digits;
}
