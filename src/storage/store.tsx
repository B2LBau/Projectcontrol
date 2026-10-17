import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { AppData, ParamValues, Project, Registration, Section, Settings } from '../domain/types';
import { deletePhotos } from '../services/photos';

const STORAGE_KEY = 'kabelcontrole20kv:data';

const EMPTY: AppData = {
  version: 1,
  settings: { userName: '', company: '' },
  projects: [],
  sections: [],
  registrations: [],
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type Store = {
  ready: boolean;
  data: AppData;
  updateSettings: (settings: Settings) => void;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'paramOverrides'>) => Project;
  updateProjectParams: (projectId: string, checkId: string, params: ParamValues | undefined) => void;
  deleteProject: (projectId: string) => void;
  addSection: (s: Omit<Section, 'id' | 'createdAt'>) => Section;
  updateSection: (section: Section) => void;
  deleteSection: (sectionId: string) => void;
  addRegistration: (r: Omit<Registration, 'id'>) => Registration;
  deleteRegistration: (registrationId: string) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setData({ ...EMPTY, ...(JSON.parse(raw) as AppData) });
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

  const removeRegistrations = useCallback((regs: Registration[]) => {
    deletePhotos(regs.flatMap((r) => r.photos));
  }, []);

  const updateSettings = useCallback((settings: Settings) => setData((d) => ({ ...d, settings })), []);

  const addProject = useCallback<Store['addProject']>((p) => {
    const project: Project = { ...p, id: newId(), createdAt: new Date().toISOString(), paramOverrides: {} };
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

  const deleteProject = useCallback(
    (projectId: string) => {
      setData((d) => {
        const sectionIds = new Set(d.sections.filter((s) => s.projectId === projectId).map((s) => s.id));
        removeRegistrations(d.registrations.filter((r) => sectionIds.has(r.sectionId)));
        return {
          ...d,
          projects: d.projects.filter((p) => p.id !== projectId),
          sections: d.sections.filter((s) => !sectionIds.has(s.id)),
          registrations: d.registrations.filter((r) => !sectionIds.has(r.sectionId)),
        };
      });
    },
    [removeRegistrations],
  );

  const addSection = useCallback<Store['addSection']>((s) => {
    const section: Section = { ...s, id: newId(), createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, sections: [...d.sections, section] }));
    return section;
  }, []);

  const updateSection = useCallback((section: Section) => {
    setData((d) => ({ ...d, sections: d.sections.map((s) => (s.id === section.id ? section : s)) }));
  }, []);

  const deleteSection = useCallback(
    (sectionId: string) => {
      setData((d) => {
        removeRegistrations(d.registrations.filter((r) => r.sectionId === sectionId));
        return {
          ...d,
          sections: d.sections.filter((s) => s.id !== sectionId),
          registrations: d.registrations.filter((r) => r.sectionId !== sectionId),
        };
      });
    },
    [removeRegistrations],
  );

  const addRegistration = useCallback<Store['addRegistration']>((r) => {
    const registration: Registration = { ...r, id: newId() };
    setData((d) => ({ ...d, registrations: [...d.registrations, registration] }));
    return registration;
  }, []);

  const deleteRegistration = useCallback(
    (registrationId: string) => {
      setData((d) => {
        removeRegistrations(d.registrations.filter((r) => r.id === registrationId));
        return { ...d, registrations: d.registrations.filter((r) => r.id !== registrationId) };
      });
    },
    [removeRegistrations],
  );

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
      deleteRegistration,
    }),
    [ready, data, updateSettings, addProject, updateProjectParams, deleteProject, addSection, updateSection, deleteSection, addRegistration, deleteRegistration],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore buiten StoreProvider');
  return store;
}
