// Detail van een melding (FO §5.12 FE detailscherm): velden, bewijs, status, termijn, discussie en historie.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';

import { dueText } from '../../components/ItemCard';
import { AttachmentList } from '../../components/Media';
import { DuePicker, MemberPicker } from '../../components/Pickers';
import { Badge, Banner, Button, Card, colors, Field, H2, Label, Loading, Muted, Row, Screen } from '../../components/ui';
import { deadlineColor } from '../../domain/deadlines';
import { allowedTransitions, isClosed, statusLabel, Transition } from '../../domain/status';
import { Attachment, Item, ITEM_TYPE_INFO, ItemEvent, SEVERITY_LABELS } from '../../domain/types';
import {
  addComment,
  getAttachments,
  getItem,
  getItemEvents,
  setDue,
  setOwner,
  setStatus,
  withdrawItem,
} from '../../lib/api';
import { openDraft } from '../../lib/draft';
import { formatFix } from '../../lib/location';
import { pickPhotos, takePhoto } from '../../lib/media';
import { enqueue } from '../../lib/outbox';
import { memberName, useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

const NOTE_REQUIRED = new Set(['afgekeurd', 'aanvulling_gevraagd']);

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function eventText(e: ItemEvent, item: Item, name: (id: string | null) => string): string {
  switch (e.kind) {
    case 'aangemaakt':
      return 'Gemeld';
    case 'status':
      return `Status: ${statusLabel(item.type, e.from_value ?? '')} → ${statusLabel(item.type, e.to_value ?? '')}`;
    case 'termijn':
      return `Termijn: ${e.from_value ? fmt(e.from_value) : 'geen'} → ${e.to_value ? fmt(e.to_value) : 'geen'}`;
    case 'eigenaar':
      return `Eigenaar: ${name(e.from_value)} → ${name(e.to_value)}`;
    case 'veld':
      return `Gewijzigd: ${e.note ?? ''}`;
    case 'opmerking':
      return 'Opmerking';
    case 'ingetrokken':
      return 'Ingetrokken';
  }
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, members, me } = useSession();
  const [item, setItem] = useState<Item | null>(null);
  const [events, setEvents] = useState<ItemEvent[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<null | { kind: 'status'; t: Transition } | { kind: 'due' } | { kind: 'withdraw' }>(null);
  const [note, setNote] = useState('');
  const [newDue, setNewDue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const it = await getItem(id);
    setItem(it);
    if (!it) return;
    const [ev, att, srcAtt] = await Promise.all([
      getItemEvents(id),
      getAttachments({ itemId: id }),
      it.source_message_id ? getAttachments({ messageIds: [it.source_message_id] }) : Promise.resolve([]),
    ]);
    setEvents(ev);
    setAttachments([...att, ...srcAtt]);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gegevens worden asynchroon geladen
    void load();
    const ch = supabase
      .channel(`item-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter: `id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, load]);

  if (!item) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const info = ITEM_TYPE_INFO[item.type];
  const closed = isClosed(item.type, item.status);
  const name = (uid: string | null) => memberName(members, uid);
  const transitions =
    me && session && !closed
      ? allowedTransitions(item.type, item.status, { userId: session.user.id, role: me.role, ownerId: item.owner_id, createdBy: item.created_by })
      : [];
  const reviewer = !!me && ['projectleider', 'werkvoorbereider', 'uitvoerder', 'werkverantwoordelijke'].includes(me.role);
  const canEdit = reviewer || item.created_by === session?.user.id;
  const comments = events.filter((e) => e.kind === 'opmerking');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAction(null);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addEvidence(lib: boolean) {
    try {
      const c = lib ? await pickPhotos() : await takePhoto();
      const list = Array.isArray(c) ? c : c ? [c] : [];
      if (!list.length) return;
      await enqueue({ id: list[0].id, op: 'attach', projectId: item!.project_id, itemId: item!.id, captures: list });
      setTimeout(load, 1500);
    } catch (e) {
      Alert.alert('Foto', String(e));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: item.number }} />
      {error && <Banner text={error} tone="danger" />}
      {item.status === 'ingetrokken' && <Banner text={`Ingetrokken: ${item.withdrawn_reason ?? ''}`} tone="warn" />}

      <Card style={{ borderLeftWidth: 6, borderLeftColor: info.color }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Badge label={`${info.icon} ${info.label}`} color={info.color} />
          <Badge label={statusLabel(item.type, item.status)} color={closed ? colors.ok : colors.primary} />
        </Row>
        <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text, marginTop: 8 }}>{item.title}</Text>
        {item.description && item.description !== item.title ? (
          <Text style={{ fontSize: 16, color: colors.text, marginTop: 6 }}>{item.description}</Text>
        ) : null}
        {item.transcript && item.transcript !== item.description ? (
          <Muted style={{ marginTop: 8, fontStyle: 'italic' }}>Ingesproken: “{item.transcript}”</Muted>
        ) : null}
        <View style={{ marginTop: 12, gap: 4 }}>
          <Text style={{ fontSize: 15 }}>
            <Text style={{ fontWeight: '700' }}>Eigenaar: </Text>
            {name(item.owner_id)}
          </Text>
          <Text style={{ fontSize: 15, color: deadlineColor(item.due_at ? new Date(item.due_at) : null, new Date(), closed) }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>Termijn: </Text>
            {item.due_at ? fmt(item.due_at) : dueText(null)}
            {item.original_due_at && item.original_due_at !== item.due_at ? `  (oorspronkelijk ${fmt(item.original_due_at)})` : ''}
          </Text>
          <Text style={{ fontSize: 15 }}>
            <Text style={{ fontWeight: '700' }}>Ernst: </Text>
            {SEVERITY_LABELS[item.severity]}
            {item.visibility === 'intern' ? ' · alleen intern' : ''}
          </Text>
          <Text style={{ fontSize: 15 }}>
            <Text style={{ fontWeight: '700' }}>Locatie: </Text>
            {[item.location_label, formatFix(item)].filter(Boolean).join(' · ')}
          </Text>
          {item.lat != null && (
            <Text
              style={{ color: colors.primary, fontWeight: '600' }}
              onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=19/${item.lat}/${item.lng}`)}
            >
              Toon op kaart
            </Text>
          )}
          <Muted>
            Gemeld door {name(item.created_by)} op {fmt(item.captured_at ?? item.created_at)}
            {item.captured_at && Math.abs(Date.parse(item.created_at) - Date.parse(item.captured_at)) > 120000 ? ` (ontvangen ${fmt(item.created_at)})` : ''}
          </Muted>
        </View>
      </Card>

      {transitions.length > 0 && !action && (
        <Card>
          <Label>Volgende stap</Label>
          {transitions.map((t) => (
            <Button
              key={t.to}
              title={t.label}
              variant={t.to === 'afgekeurd' ? 'danger' : 'primary'}
              busy={busy}
              onPress={() => (NOTE_REQUIRED.has(t.to) || t.label.toLowerCase().includes('afkeuren') ? setAction({ kind: 'status', t }) : run(() => setStatus(item.id, t.to)))}
            />
          ))}
        </Card>
      )}

      {action?.kind === 'status' && (
        <Card>
          <H2>{action.t.label}</H2>
          <Field label="Reden / toelichting" value={note} onChangeText={setNote} multiline />
          <Button title="Bevestigen" busy={busy} disabled={!note.trim()} onPress={() => run(() => setStatus(item.id, action.t.to, note.trim()))} />
          <Button title="Annuleren" variant="secondary" onPress={() => setAction(null)} />
        </Card>
      )}

      {action?.kind === 'due' && (
        <Card>
          <DuePicker value={newDue} onChange={setNewDue} />
          {item.due_at && <Field label="Reden voor wijziging (verplicht)" value={note} onChangeText={setNote} />}
          <Button title="Termijn opslaan" busy={busy} disabled={!!item.due_at && !note.trim()} onPress={() => run(() => setDue(item.id, newDue, note.trim()))} />
          <Button title="Annuleren" variant="secondary" onPress={() => setAction(null)} />
        </Card>
      )}

      {action?.kind === 'withdraw' && (
        <Card>
          <H2>Melding intrekken</H2>
          <Muted style={{ marginBottom: 8 }}>De melding blijft zichtbaar in de historie met de reden.</Muted>
          <Field label="Reden (verplicht)" value={note} onChangeText={setNote} />
          <Button title="Intrekken" variant="danger" busy={busy} disabled={!note.trim()} onPress={() => run(() => withdrawItem(item.id, note.trim()))} />
          <Button title="Annuleren" variant="secondary" onPress={() => setAction(null)} />
        </Card>
      )}

      <Card>
        <Label>Bewijs</Label>
        {attachments.length ? <AttachmentList items={attachments} /> : <Muted>Geen foto&apos;s of opnames.</Muted>}
        {!closed && (
          <Row style={{ marginTop: 8 }}>
            <Button title="📷 Foto toevoegen" small onPress={() => addEvidence(false)} />
            <Button title="🖼 Galerij" small variant="secondary" onPress={() => addEvidence(true)} />
          </Row>
        )}
      </Card>

      {!closed && (
        <Card>
          <Label>Beheer</Label>
          <MemberPicker label="Eigenaar wijzigen" members={members} value={item.owner_id} onChange={(uid) => run(() => setOwner(item.id, uid))} />
          {(canEdit || item.owner_id === session?.user.id) && (
            <Button title="Termijn wijzigen" variant="secondary" onPress={() => (setNewDue(item.due_at), setNote(''), setAction({ kind: 'due' }))} />
          )}
          <Button
            title="Vervolgactie maken"
            variant="secondary"
            onPress={() => {
              openDraft({ projectId: item.project_id, text: '', captures: [], typeHint: 'actie', parentItemId: item.id });
            }}
          />
          {canEdit && <Button title="Intrekken" variant="danger" onPress={() => (setNote(''), setAction({ kind: 'withdraw' }))} />}
        </Card>
      )}

      <Card>
        <Label>Discussie</Label>
        {comments.length === 0 && <Muted>Nog geen opmerkingen.</Muted>}
        {comments.map((c) => (
          <View key={c.id} style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: '700' }}>
              {name(c.actor_id)} <Muted>{fmt(c.at)}</Muted>
            </Text>
            <Text style={{ fontSize: 16 }}>{c.note}</Text>
          </View>
        ))}
        <Field label="Opmerking" value={comment} onChangeText={setComment} multiline />
        <Button title="Plaatsen" small disabled={!comment.trim()} busy={busy} onPress={() => run(async () => (await addComment(item.id, comment.trim()), setComment('')))} />
      </Card>

      <Card>
        <Label>Historie</Label>
        {events
          .filter((e) => e.kind !== 'opmerking')
          .map((e) => (
            <View key={e.id} style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 15 }}>{eventText(e, item, name)}</Text>
              <Muted>
                {name(e.actor_id)} · {fmt(e.at)}
                {e.note && e.kind !== 'veld' ? ` · ${e.note}` : ''}
              </Muted>
            </View>
          ))}
      </Card>
    </Screen>
  );
}
