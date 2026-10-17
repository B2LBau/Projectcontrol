import type { Role } from './types';

export const ROLES: { value: Role; label: string }[] = [
  { value: 'grondwerk', label: 'Uitvoerder grondwerk' },
  { value: 'monteur', label: 'Kabelmonteur' },
  { value: 'beproever', label: 'Beproever' },
  { value: 'toezichthouder', label: 'Toezichthouder' },
  { value: 'werkverantwoordelijke', label: 'Werkverantwoordelijke' },
];

export function roleLabel(role: Role | ''): string {
  return ROLES.find((r) => r.value === role)?.label ?? 'geen rol';
}

/** Alleen de werkverantwoordelijke geeft een tracédeel vrij voor aanvullen (besluit OP-04). */
export function canRelease(role: Role | ''): boolean {
  return role === 'werkverantwoordelijke';
}

/** Ondertekening zoals die bij registraties, vrijgaven en intrekkingen wordt vastgelegd. */
export function signature(settings: { userName: string; role: Role | '' }): string {
  const name = settings.userName || 'onbekend';
  return settings.role ? `${name} (${roleLabel(settings.role)})` : name;
}
