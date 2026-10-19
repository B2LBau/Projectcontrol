import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Member, Profile, Project } from '../domain/types';
import { claimInvites, getMembers, getProfile, getProjects } from './api';
import { flush, loadOutbox } from './outbox';
import { supabase } from './supabase';

type Ctx = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  projects: Project[];
  project: Project | null;
  members: Member[];
  me: Member | null;
  selectProject: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);
const PROJECT_KEY = 'projectmelder.project';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadedMembers, setLoadedMembers] = useState<{ projectId: string; list: Member[] } | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setProjects([]);
      return;
    }
    try {
      await claimInvites();
    } catch {
      // offline: later opnieuw
    }
    const [p, list, stored] = await Promise.all([
      getProfile(s.user.id).catch(() => null),
      getProjects().catch(() => [] as Project[]),
      AsyncStorage.getItem(PROJECT_KEY),
    ]);
    setProfile(p);
    setProjects(list);
    const pick = list.find((x) => x.id === stored) ?? list[0] ?? null;
    setProjectId(pick?.id ?? null);
    void loadOutbox().then(flush);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    getMembers(projectId)
      .then((list) => setLoadedMembers({ projectId, list }))
      .catch(() => {});
  }, [projectId]);
  const members = useMemo(
    () => (loadedMembers && loadedMembers.projectId === projectId ? loadedMembers.list : []),
    [loadedMembers, projectId],
  );

  // Wachtrij periodiek proberen te versturen
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => void flush(), 30000);
    return () => clearInterval(t);
  }, [session]);

  const value = useMemo<Ctx>(() => {
    const project = projects.find((p) => p.id === projectId) ?? null;
    return {
      ready,
      session,
      profile,
      projects,
      project,
      members,
      me: members.find((m) => m.user_id === session?.user.id) ?? null,
      selectProject: (id: string) => {
        setProjectId(id);
        void AsyncStorage.setItem(PROJECT_KEY, id);
      },
      refresh: () => load(session),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [ready, session, profile, projects, projectId, members, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession buiten SessionProvider');
  return c;
}

export function memberName(members: Member[], id: string | null | undefined): string {
  if (!id) return '—';
  return members.find((m) => m.user_id === id)?.full_name || 'Onbekend';
}
