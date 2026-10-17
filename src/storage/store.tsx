import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_GRID_OPERATOR } from '../domain/requirements';
import type { AppData, ParamValues, Project, Registration, Section, Settings } from '../domain/types';

const STORAGE_KEY = 'kabelcontrole20kv:data';

const EMPTY: AppData = {
  version: 1,
  settings: { userName: '', company: '', role: '' },
  projects: [],
  sections: [],
  registrations: [],
};

/** Vult velden aan die in eerdere versies van de app nog niet bestonden. */
function migrate(stored: AppData): AppData {
  return {
    ...EMPTY,
    ...stored,
    settings: { ...EMPTY.settings, ...stored.settings },
    projects: stored.projects.map((p) => ({ ...p, gridOperator: p.gridOperator ?? DEFAULT_GRID_OPERATOR })),
  };
}

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
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setData(migrate(JSON.parse(raw) as AppData));
      })
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('Opslaan mislukt', e));
  }, [data]);

  const updateSettings = useCallback((settings: Settings) => setData((d) => ({ ...d, settings })), []);

  const addProject = useCallback<Store['addProject']>((p) => {
    const project: Project = {
      ...p,
      id: newId(),
      gridOperator: DEFAULT_GRID_OPERATOR,
      createdAt: new Date().toISOString(),
      paramOverrides: {},
    };
    setData((d) => ({ ...d, projects: [project, ...d.projects] }));
    return project;
  }, []);

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
    }));
  }, []);

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
    });
  }, []);

  const addSection = useCallback<Store['addSection']>((s) => {
    const section: Section = { ...s, id: newId(), createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, sections: [...d.sections, section] }));
    return section;
  }, []);

  const updateSection = useCallback((section: Section) => {
    setData((d) => ({ ...d, sections: d.sections.map((s) => (s.id === section.id ? section : s)) }));
  }, []);

  const deleteSection = useCallback((sectionId: string) => {
    setData((d) => {
      if (d.registrations.some((r) => r.sectionId === sectionId)) return d;
      return { ...d, sections: d.sections.filter((s) => s.id !== sectionId) };
    });
  }, []);

  const addRegistration = useCallback<Store['addRegistration']>((r) => {
    const registration: Registration = { ...r, id: newId() };
    setData((d) => ({ ...d, registrations: [...d.registrations, registration] }));
    return registration;
  }, []);

  const withdrawRegistration = useCallback<Store['withdrawRegistration']>((registrationId, by, reason) => {
    const withdrawn = { by, at: new Date().toISOString(), reason };
    setData((d) => ({
      ...d,
      registrations: d.registrations.map((r) => (r.id === registrationId && !r.withdrawn ? { ...r, withdrawn } : r)),
    }));
  }, []);

  const releaseSection = useCallback<Store['releaseSection']>((sectionId, by) => {
    const at = new Date().toISOString();
    setData((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === sectionId ? { ...s, release: { by, at }, releaseLog: [...(s.releaseLog ?? []), { action: 'vrijgegeven', by, at }] } : s,
      ),
    }));
  }, []);

  const revokeRelease = useCallback<Store['revokeRelease']>((sectionId, by, reason) => {
    const at = new Date().toISOString();
    setData((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === sectionId
          ? { ...s, release: undefined, releaseLog: [...(s.releaseLog ?? []), { action: 'ingetrokken', by, at, reason }] }
          : s,
      ),
    }));
  }, []);

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
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore buiten StoreProvider');
  return store;
}
