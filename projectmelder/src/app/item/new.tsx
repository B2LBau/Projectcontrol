// Bevestigen van één of meer voorgestelde meldingen en in de wachtrij zetten.
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { fromSuggestion, ItemForm, ItemFormValue } from '../../components/ItemForm';
import { CaptureList } from '../../components/Media';
import { Banner, Button, Card, colors, Label, Loading, Muted, Row, Screen } from '../../components/ui';
import type { Suggestion } from '../../domain/suggest';
import { ITEM_TYPE_INFO } from '../../domain/types';
import { NewItem, suggest } from '../../lib/api';
import { Draft, getDraft } from '../../lib/draft';
import { currentFix, Fix } from '../../lib/location';
import { Capture, pickPhotos, takePhoto } from '../../lib/media';
import { enqueue } from '../../lib/outbox';
import { useSession } from '../../lib/session';

export default function NewItemScreen() {
  const { session, members, me, project, projects } = useSession();
  const params = useLocalSearchParams<{ draft?: string }>();
  const [draft] = useState<Draft | null>(() => getDraft(params.draft));
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [captures, setCaptures] = useState<Capture[]>(draft?.captures ?? []);
  // Positie: van de eerste opname, anders bij openen bepalen.
  const [fix, setFix] = useState<Fix | null>(() => draft?.captures.find((c) => c.fix)?.fix ?? null);
  const [saving, setSaving] = useState(false);
  const [capturedAt] = useState(() => new Date().toISOString());
  const [attached, setAttached] = useState(false);

  const projectId = draft?.projectId ?? project?.id;
  const proj = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!draft || !projectId) return;
    if (!fix) currentFix().then(setFix);
    const text = draft.text || (draft.captures.length ? 'Melding met foto' : '');
    suggest(projectId, text, members, draft.typeHint).then(setSuggestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft || !projectId || !session) {
    return (
      <Screen>
        <Banner text="Geen concept-melding gevonden." />
        <Button title="Terug" onPress={() => router.back()} />
      </Screen>
    );
  }

  async function save(i: number, s: Suggestion, v: ItemFormValue) {
    setSaving(true);
    try {
      const id = Crypto.randomUUID();
      const first = !attached;
      const item: NewItem = {
        id,
        project_id: projectId!,
        type: v.type,
        title: v.title.trim(),
        description: v.description.trim() || null,
        transcript: draft!.text || null,
        severity: v.severity,
        owner_id: v.owner_id,
        due_at: v.due_at,
        location_label: v.location_label.trim() || null,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracy: fix?.accuracy ?? null,
        captured_at: draft!.captures[0]?.captured_at ?? capturedAt,
        visibility: v.visibility,
        labels: [],
        meeting_id: draft!.meetingId ?? null,
        source_message_id: draft!.sourceMessageId ?? null,
        parent_item_id: draft!.parentItemId ?? null,
        details: s.source === 'ai' ? { voorstel: 'ai' } : {},
        ai_fields: v.ai_fields,
      };
      // Bijlagen horen bij de eerste opgeslagen melding; volgende meldingen uit dezelfde opname verwijzen ernaar.
      await enqueue({
        id,
        op: 'item',
        item,
        captures: first ? captures : [],
        announce: draft!.channelId
          ? {
              id: Crypto.randomUUID(),
              channel_id: draft!.channelId,
              sender_id: session!.user.id,
              kind: 'melding',
              body: `${ITEM_TYPE_INFO[v.type].label}: ${item.title}`,
              transcript: null,
              item_id: id,
              captured_at: item.captured_at,
              lat: item.lat,
              lng: item.lng,
              accuracy: item.accuracy,
            }
          : undefined,
      });
      setAttached(true);
      const next = new Set(done).add(i);
      setDone(next);
      if (next.size === suggestions!.length) router.back();
    } catch (e) {
      Alert.alert('Opslaan mislukt', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function skip(i: number) {
    const next = new Set(done).add(i);
    setDone(next);
    if (next.size === suggestions!.length) router.back();
  }

  async function addPhoto(lib: boolean) {
    try {
      const c = lib ? await pickPhotos() : await takePhoto();
      if (c) setCaptures((x) => [...x, ...(Array.isArray(c) ? c : [c])]);
    } catch (e) {
      Alert.alert('Foto', e instanceof Error ? e.message : String(e));
    }
  }

  const canInternal = me?.organisation_kind === 'eigen';

  return (
    <Screen>
      <Stack.Screen options={{ title: proj ? `Melding · ${proj.code}` : 'Nieuwe melding' }} />
      {draft.text ? (
        <Card>
          <Label>Wat je zei</Label>
          <Text style={{ fontSize: 16, color: colors.text }}>{draft.text}</Text>
        </Card>
      ) : null}
      <Card>
        <Label>Bewijs</Label>
        <CaptureList captures={captures} onRemove={!attached ? (id) => setCaptures((x) => x.filter((c) => c.id !== id)) : undefined} />
        {!attached && (
          <Row>
            <Button title="📷 Foto" small onPress={() => addPhoto(false)} />
            <Button title="🖼 Galerij" small variant="secondary" onPress={() => addPhoto(true)} />
          </Row>
        )}
        <Muted>
          Melder: {me?.full_name ?? 'jij'} · {new Date(capturedAt).toLocaleString('nl-NL')} ·{' '}
          {fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}${fix.accuracy ? ` (±${Math.round(fix.accuracy)} m)` : ''}` : 'locatie onbekend'}
        </Muted>
      </Card>

      {suggestions === null ? (
        <Card>
          <Loading />
          <Muted style={{ textAlign: 'center' }}>Voorstel maken…</Muted>
        </Card>
      ) : (
        suggestions.map((s, i) =>
          done.has(i) ? (
            <Banner key={i} text={`Opgeslagen: ${s.title}`} tone="ok" />
          ) : (
            <ItemForm
              key={i}
              index={i}
              total={suggestions.length}
              initial={fromSuggestion(s)}
              source={s.source}
              members={members}
              canInternal={canInternal}
              saving={saving}
              onSave={(v) => save(i, s, v)}
              onDiscard={() => skip(i)}
            />
          ),
        )
      )}
    </Screen>
  );
}
