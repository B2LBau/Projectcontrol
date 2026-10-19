// Concept-melding dat van het opnamescherm (melden, chat, overleg) naar het
// bevestigingsscherm gaat. Alleen in het geheugen; na opslaan staat alles in de wachtrij.
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';

import type { ItemType } from '../domain/types';
import type { Capture } from './media';

export type Draft = {
  projectId: string;
  text: string;
  captures: Capture[];
  typeHint?: ItemType;
  meetingId?: string | null;
  channelId?: string | null;
  sourceMessageId?: string | null;
  parentItemId?: string | null;
};

const drafts = new Map<string, Draft>();

/** Bewaart het concept en opent het bevestigingsscherm. */
export function openDraft(d: Draft) {
  const id = Crypto.randomUUID();
  // Alleen de laatste paar concepten bewaren
  if (drafts.size > 5) drafts.delete(drafts.keys().next().value!);
  drafts.set(id, d);
  router.push({ pathname: '/item/new', params: { draft: id } });
}

export function getDraft(id: string | undefined): Draft | null {
  return (id && drafts.get(id)) || null;
}
