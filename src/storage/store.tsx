import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { DEFAULT_GRID_OPERATOR } from '../domain/requirements';
import type { AppData, ParamValues, Project, Registration, Section, Settings } from '../domain/types';
import { localPhotoUri } from '../services/photos';
import { useAuth } from './auth';
import { downloadMissingPhotos, runSync } from './sync';
import { allKeys, clearPending, EMPTY_SYNC, markPending, mergePulled, SyncMeta, syncKey } from './syncModel';

const STORAGE_KEY = 'kabelcontrole20kv:data';

const EMPTY: AppData = {
  version: 1,
  settings: { userName: '', company: '', role: '' },
  projects: [],
  sections: [],
  registrations: [],
};

type State = { data: AppData; sync: SyncMeta };
type Stored = AppData & { sync?: SyncMeta };

/** Vult velden aan die in eerdere versies van de app nog niet bestonden. */
function migrate(stored: Stored): State {
  const { sync, ...rest } = stored;
  const data: AppData = {
    ...EMPTY,
    ...rest,
    settings: { ...EMPTY.settings, ...rest.settings },
    projects: rest.projects.map((p) => ({ ...p, gridOperator: p.gridOperator ?? DEFAULT_GRID_OPERATOR })),
  };
  // Gegevens van vóór de koppeling met Supabase: alles nog versturen.
  return { data, sync: sync ?? markPending(EMPTY_SYNC, allKeys(data)) };
}

const SYNC_DELAY_MS = 3000;
const SYNC_INTERVAL_MS = 2 * 60 * 1000;

export type SyncStatus = {
  enabled: boolean;
  running: boolean;
  /** Aantal wijzigingen dat nog naar de server moet. */
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type Store = {
  ready: boolean;
  data: AppData;
  updateSettings: (settings: Settings) => void;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'paramOverrides' | 'gridOperator'>) => Project;
  updateProjectParams: (projectId: string, checkId: string, params: ParamValues | undefined) => void;
  deleteProject: (projectId: string) => void;
  addSection: (s: Omit<Section, 'id' | 'createdAt'>) => Section;
  updateSection: (section: Section) => void;
  deleteSection: (sectionId: string) => void;
  addRegistration: (r: Omit<Registration, 'id'>) => Registration;
  withdrawRegistration: (registrationId: string, by: string, reason: string) => void;
  releaseSection: (sectionId: string, by: string) => void;
  revokeRelease: (sectionId: string, by: string, reason: string) => void;
  syncStatus: SyncStatus;
  syncNow: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ data: EMPTY, sync: EMPTY_SYNC });
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  const latest = useRef(state);
  const data = state.data;

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState(migrate(JSON.parse(raw) as Stored));
      })
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const stored: Stored = { ...state.data, sync: state.sync };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch((e) => console.warn('Opslaan mislukt', e));
  }, [state]);

  /** Past de gegevens aan en zet de gewijzigde records in de wachtrij voor de server. */
  const setData = useCallback((fn: (d: AppData) => AppData, touched: (before: AppData, after: AppData) => string[]) => {
    setState((s) => {
      const next = fn(s.data);
      if (next === s.data) return s;
      return { data: next, sync: markPending(s.sync, touched(s.data, next)) };
    });
  }, []);

  // Synchronisatie met Supabase ---------------------------------------------------------------------

  const auth = useAuth();
  const syncEnabled = auth.configured && !!auth.session;
  const [running, setRunning] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  const syncNow = useCallback(() => {
    if (!syncEnabled || !loaded.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setRunning(true);
    (async () => {
      try {
        let merged = latest.current.data;
        do {
          again.current = false;
          const snapshot = latest.current;
          const result = await runSync(snapshot.data, snapshot.sync);
          setState((s) => {
            const sync = { ...clearPending(s.sync, result.sent), cursor: result.cursor };
            return { data: mergePulled(s.data, sync, result.pulled, localPhotoUri), sync };
          });
          merged = mergePulled(snapshot.data, snapshot.sync, result.pulled, localPhotoUri);
          setSyncError(result.errors.length ? `Niet alles kon verstuurd worden: ${result.errors[0]}` : null);
          setLastSyncAt(new Date().toISOString());
        } while (again.current);
        // Foto's van collega's ophalen.
        await downloadMissingPhotos(merged);
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e));
      } finally {
        busy.current = false;
        setRunning(false);
      }
    })();
  }, [syncEnabled]);

  // Bij inloggen/opstarten, bij terugkeer naar de app en periodiek synchroniseren.
  useEffect(() => {
    if (!syncEnabled || !ready) return;
    syncNow();
    const timer = setInterval(syncNow, SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncNow();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [syncEnabled, ready, syncNow]);

  // Kort na een wijziging versturen.
  const pendingCount = Object.keys(state.sync.pending).length;
  useEffect(() => {
    if (!syncEnabled || !ready || pendingCount === 0) return;
    const timer = setTimeout(syncNow, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [syncEnabled, ready, pendingCount, state.sync.seq, syncNow]);

  const syncStatus = useMemo<SyncStatus>(
    () => ({ enabled: syncEnabled, running, pending: pendingCount, lastSyncAt, error: syncError }),
    [syncEnabled, running, pendingCount, lastSyncAt, syncError],
  );

  // Wijzigingen -------------------------------------------------------------------------------------

  const updateSettings = useCallback((settings: Settings) => setState((s) => ({ ...s, data: { ...s.data, settings } })), []);

  const addProject = useCallback<Store['addProject']>((p) => {
    const project: Project = {
      ...p,
      id: newId(),
      gridOperator: DEFAULT_GRID_OPERATOR,
      createdAt: new Date().toISOString(),
      paramOverrides: {},
    };
    setData((d) => ({ ...d, projects: [project, ...d.projects] }), () => [syncKey('projects', project.id)]);
    return project;
  }, [setData]);

  const updateProjectParams = useCallback<Store['updateProjectParams']>((projectId, checkId, params) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== projectId) return p;
        const paramOverrides = { ...p.paramOverrides };
        if (params) paramOverrides[checkId] = params;
        else delete paramOverrides[checkId];
        return { ...p, paramOverrides };
      }),
    }), () => [syncKey('projects', projectId)]);
  }, [setData]);

  // Registraties worden nooit verwijderd (besluit OP-03): alleen een leeg project of tracédeel kan weg.
  const deleteProject = useCallback((projectId: string) => {
    setData((d) => {
      const sectionIds = new Set(d.sections.filter((s) => s.projectId === projectId).map((s) => s.id));
      if (d.registrations.some((r) => sectionIds.has(r.sectionId))) return d;
      return {
        ...d,
        projects: d.projects.filter((p) => p.id !== projectId),
        sections: d.sections.filter((s) => !sectionIds.has(s.id)),
      };
    }, (before) => [
      syncKey('projects', projectId),
      ...before.sections.filter((s) => s.projectId === projectId).map((s) => syncKey('sections', s.id)),
    ]);
  }, [setData]);

  const addSection = useCallback<Store['addSection']>((s) => {
    const section: Section = { ...s, id: newId(), createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, sections: [...d.sections, section] }), () => [syncKey('sections', section.id)]);
    return section;
  }, [setData]);

  const updateSection = useCallback((section: Section) => {
    setData(
      (d) => ({ ...d, sections: d.sections.map((s) => (s.id === section.id ? section : s)) }),
      () => [syncKey('sections', section.id)],
    );
  }, [setData]);

  const deleteSection = useCallback((sectionId: string) => {
    setData((d) => {
      if (d.registrations.some((r) => r.sectionId === sectionId)) return d;
      return { ...d, sections: d.sections.filter((s) => s.id !== sectionId) };
    }, () => [syncKey('sections', sectionId)]);
  }, [setData]);

  const addRegistration = useCallback<Store['addRegistration']>((r) => {
    const registration: Registration = { ...r, id: newId() };
    setData((d) => ({ ...d, registrations: [...d.registrations, registration] }), () => [syncKey('registrations', registration.id)]);
    return registration;
  }, [setData]);

  const withdrawRegistration = useCallback<Store['withdrawRegistration']>((registrationId, by, reason) => {
    const withdrawn = { by, at: new Date().toISOString(), reason };
    setData((d) => ({
      ...d,
      registrations: d.registrations.map((r) => (r.id === registrationId && !r.withdrawn ? { ...r, withdrawn } : r)),
    }), () => [syncKey('registrations', registrationId)]);
  }, [setData]);

  const releaseSection = useCallback<Store['releaseSection']>((sectionId, by) => {
    const at = new Date().toISOString();
    setData((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === sectionId ? { ...s, release: { by, at }, releaseLog: [...(s.releaseLog ?? []), { action: 'vrijgegeven', by, at }] } : s,
      ),
    }), () => [syncKey('sections', sectionId)]);
  }, [setData]);

  const revokeRelease = useCallback<Store['revokeRelease']>((sectionId, by, reason) => {
    const at = new Date().toISOString();
    setData((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === sectionId
          ? { ...s, release: undefined, releaseLog: [...(s.releaseLog ?? []), { action: 'ingetrokken', by, at, reason }] }
          : s,
      ),
    }), () => [syncKey('sections', sectionId)]);
  }, [setData]);

  const store = useMemo<Store>(
    () => ({
      ready,
      data,
      updateSettings,
      addProject,
      updateProjectParams,
      deleteProject,
      addSection,
      updateSection,
      deleteSection,
      addRegistration,
      withdrawRegistration,
      releaseSection,
      revokeRelease,
      syncStatus,
      syncNow,
    }),
    [
      ready,
      data,
      updateSettings,
      addProject,
      updateProjectParams,
      deleteProject,
      addSection,
      updateSection,
      deleteSection,
      addRegistration,
      withdrawRegistration,
      releaseSection,
      revokeRelease,
      syncStatus,
      syncNow,
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore buiten StoreProvider');
  return store;
}
