import { getRequirement } from '../domain/requirements';
import { REGISTRATION_ROLE_LABEL, registrationRole, sectionState, STATUS_LABEL } from '../domain/status';
import type { AppData, Project, Registration } from '../domain/types';
import { formatPosition } from '../services/location';

export type ReportRow = {
  check: string;
  status: string;
  ok: boolean;
  details: string[];
  recordedBy: string;
  recordedAt: string;
  position: string;
  remark: string;
  photos: string[];
};

/** Elke registratie, ook vervangen en ingetrokken, zodat het dossier de volledige historie toont. */
export type HistoryRow = {
  check: string;
  recordedAt: string;
  recordedBy: string;
  result: string;
  state: string;
  note: string;
};

export type ReportSection = {
  name: string;
  range: string;
  summary: string;
  release: string;
  rows: ReportRow[];
  history: HistoryRow[];
  releaseLog: string[];
};

export type Report = {
  title: string;
  project: Project;
  generatedAt: string;
  generatedBy: string;
  sections: ReportSection[];
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
}

function row(checkId: string, status: keyof typeof STATUS_LABEL, reg?: Registration): ReportRow {
  return {
    check: getRequirement(checkId).title,
    status: STATUS_LABEL[status],
    ok: status === 'voldoet',
    details: reg?.evaluation.details ?? [],
    recordedBy: reg?.recordedBy ?? '',
    recordedAt: reg ? formatDateTime(reg.recordedAt) : '',
    position: reg ? formatPosition(reg.location) : '',
    remark: reg?.remark ?? '',
    photos: reg?.photos ?? [],
  };
}

/** Bewijsdossier per project: per tracédeel de laatste registratie per vereiste eis. */
export function buildReport(data: AppData, projectId: string): Report {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Project niet gevonden');
  const sections = data.sections
    .filter((s) => s.projectId === projectId)
    .map((s): ReportSection => {
      const state = sectionState(s, data.registrations);
      const ok = state.checks.filter((c) => c.status === 'voldoet').length;
      return {
        name: s.name,
        range: [s.from, s.to].filter(Boolean).join(' – '),
        summary: `${ok} van ${state.checks.length} eisen aangetoond${state.failed ? `, ${state.failed} afwijking(en)` : ''}`,
        release: s.release
          ? `Vrijgegeven voor aanvullen door ${s.release.by} op ${formatDateTime(s.release.at)}`
          : 'Nog niet vrijgegeven voor aanvullen',
        rows: state.checks.map((c) => row(c.checkId, c.status, c.latest)),
        history: data.registrations
          .filter((r) => r.sectionId === s.id)
          .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
          .map((r) => ({
            check: getRequirement(r.checkId).title,
            recordedAt: formatDateTime(r.recordedAt),
            recordedBy: r.recordedBy,
            result: STATUS_LABEL[r.evaluation.status],
            state: REGISTRATION_ROLE_LABEL[registrationRole(r, data.registrations)],
            note: r.withdrawn
              ? `Ingetrokken door ${r.withdrawn.by} op ${formatDateTime(r.withdrawn.at)}: ${r.withdrawn.reason}`
              : `${r.photos.length} foto('s)`,
          })),
        releaseLog: (s.releaseLog ?? []).map(
          (e) =>
            `${formatDateTime(e.at)} – ${e.action === 'vrijgegeven' ? 'Vrijgegeven' : 'Vrijgave ingetrokken'} door ${e.by}${e.reason ? `: ${e.reason}` : ''}`,
        ),
      };
    });
  return {
    title: `Bewijsdossier 20 kV kabelaanleg – ${project.name}`,
    project,
    generatedAt: formatDateTime(new Date().toISOString()),
    generatedBy: [data.settings.userName, data.settings.company].filter(Boolean).join(', '),
    sections,
  };
}
