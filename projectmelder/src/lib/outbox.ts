// Offline wachtrij (FO §5.15): meldingen, berichten en bestanden worden lokaal bewaard
// en verstuurd zodra er verbinding is. Tijd en locatie zijn al vastgelegd op het
// moment van opname; het verzendmoment wordt apart door de server vastgelegd.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { insertItem, insertMessage, NewItem } from './api';
import { Capture, removeLocal, uploadCapture } from './media';

type MessageRow = Parameters<typeof insertMessage>[0];

export type OutboxEntry =
  | { id: string; op: 'item'; item: NewItem; captures: Capture[]; announce?: MessageRow; attempts: number; error?: string }
  | { id: string; op: 'message'; message: MessageRow; projectId: string; captures: Capture[]; attempts: number; error?: string }
  | { id: string; op: 'attach'; projectId: string; itemId: string; captures: Capture[]; attempts: number; error?: string };

type NewEntry =
  | Omit<Extract<OutboxEntry, { op: 'item' }>, 'attempts'>
  | Omit<Extract<OutboxEntry, { op: 'message' }>, 'attempts'>
  | Omit<Extract<OutboxEntry, { op: 'attach' }>, 'attempts'>;

const KEY = 'projectmelder.outbox.v1';
let entries: OutboxEntry[] = [];
let loaded = false;
let flushing = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function save() {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  emit();
}

export async function loadOutbox() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    entries = raw ? JSON.parse(raw) : [];
  } catch {
    entries = [];
  }
  loaded = true;
  emit();
}

export async function enqueue(e: NewEntry) {
  await loadOutbox();
  entries = [...entries, { ...e, attempts: 0 } as OutboxEntry];
  await save();
  void flush();
}

async function process(e: OutboxEntry) {
  if (e.op === 'item') {
    await insertItem(e.item);
    for (const c of e.captures) await uploadCapture(c, { projectId: e.item.project_id, itemId: e.item.id });
    if (e.announce) await insertMessage(e.announce);
  } else if (e.op === 'message') {
    await insertMessage(e.message);
    for (const c of e.captures) await uploadCapture(c, { projectId: e.projectId, messageId: e.message.id });
  } else {
    for (const c of e.captures) await uploadCapture(c, { projectId: e.projectId, itemId: e.itemId });
  }
}

/** Verstuurt de wachtrij op volgorde. Bij een netwerkfout stopt het en volgt later een nieuwe poging. */
export async function flush(): Promise<void> {
  await loadOutbox();
  if (flushing || entries.length === 0) return;
  flushing = true;
  try {
    while (entries.length > 0) {
      const e = entries[0];
      try {
        await process(e);
        entries = entries.slice(1);
        await save();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        e.attempts += 1;
        e.error = msg;
        // Inhoudelijke fout (geen netwerk): na 5 pogingen achteraan zetten zodat de rest doorgaat.
        if (e.attempts >= 5 && !/network|fetch|timeout|offline/i.test(msg)) {
          entries = [...entries.slice(1), e];
        }
        await save();
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export async function discard(id: string) {
  const e = entries.find((x) => x.id === id);
  e?.captures.forEach((c) => removeLocal(c.uri));
  entries = entries.filter((x) => x.id !== id);
  await save();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(subscribe, () => entries, () => entries);
}

/** Meldingen die nog niet op de server staan (worden in lijsten als "wacht op verzending" getoond). */
export function pendingItems(projectId: string): NewItem[] {
  return entries.flatMap((e) => (e.op === 'item' && e.item.project_id === projectId ? [e.item] : []));
}
