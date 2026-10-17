import { getRequirement } from './requirements';
import type { CheckStatus, Registration, Section } from './types';

export type CheckState = {
  checkId: string;
  status: CheckStatus | 'ontbreekt';
  latest?: Registration;
};

export type SectionState = {
  checks: CheckState[];
  /** Alle eisen die vóór het aanvullen aangetoond moeten zijn, voldoen. */
  readyForBackfill: boolean;
  /** Alle vereiste eisen voldoen. */
  complete: boolean;
  open: number;
  failed: number;
};

/** De laatste registratie per eis telt; een herstelde afwijking wordt zo opnieuw aangetoond. */
export function latestRegistration(registrations: Registration[], sectionId: string, checkId: string) {
  let latest: Registration | undefined;
  for (const r of registrations) {
    if (r.sectionId !== sectionId || r.checkId !== checkId) continue;
    if (!latest || r.recordedAt > latest.recordedAt) latest = r;
  }
  return latest;
}

export function sectionState(section: Section, registrations: Registration[]): SectionState {
  const checks: CheckState[] = section.requiredChecks.map((checkId) => {
    const latest = latestRegistration(registrations, section.id, checkId);
    return { checkId, status: latest ? latest.evaluation.status : 'ontbreekt', latest };
  });
  const readyForBackfill = checks
    .filter((c) => getRequirement(c.checkId).beforeBackfill)
    .every((c) => c.status === 'voldoet');
  return {
    checks,
    readyForBackfill,
    complete: checks.every((c) => c.status === 'voldoet'),
    open: checks.filter((c) => c.status === 'ontbreekt' || c.status === 'onvolledig').length,
    failed: checks.filter((c) => c.status === 'voldoet_niet').length,
  };
}

export const STATUS_LABEL: Record<CheckState['status'], string> = {
  voldoet: 'Voldoet',
  voldoet_niet: 'Voldoet niet',
  onvolledig: 'Onvolledig',
  ontbreekt: 'Nog aantonen',
};
