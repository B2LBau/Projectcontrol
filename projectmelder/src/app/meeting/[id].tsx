// Overlegmodus (FO §5.6): acties en besluiten inspreken, openstaande acties doorlopen, verslag maken.
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { ItemCard } from '../../components/ItemCard';
import { Banner, Button, Card, Chip, Chips, H2, Label, Muted, Row, Screen } from '../../components/ui';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import type { Item, ItemType, Meeting } from '../../domain/types';
import { closeMeeting, getItems, getMeeting } from '../../lib/api';
import { openDraft } from '../../lib/draft';
import { useSession } from '../../lib/session';
import { exportReport, Format } from '../../report/export';
import { meetingReport } from '../../report/model';

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project, members } = useSession();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [openBefore, setOpenBefore] = useState<Item[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ItemType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const m = await getMeeting(id);
    setMeeting(m);
    if (!m) return;
    const att = m.attendees ?? [];
    if (att.length) setPresent(new Set(att.filter((a) => a.present).map((a) => a.user_id)));
    setItems(await getItems({ projectId: m.project_id, meetingId: m.id }));
    const open = await getItems({ projectId: m.project_id, open: true, types: ['actie', 'vraag', 'afwijking'] });
    setOpenBefore(open.filter((i) => i.meeting_id && i.meeting_id !== m.id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!meeting || !project) return null;
  const closed = !!meeting.closed_at;

  function record(type: ItemType, transcript: string, audio: Parameters<typeof openDraft>[0]['captures']) {
    openDraft({ projectId: meeting!.project_id, text: transcript, captures: audio, typeHint: type, meetingId: meeting!.id });
    setMode(null);
  }

  async function doExport(f: Format) {
    try {
      await exportReport(meetingReport(project!, meeting!, items, openBefore, members), f);
    } catch (e) {
      Alert.alert('Export mislukt', String(e));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: meeting.title }} />
      {error && <Banner text={error} tone="danger" />}
      <Card>
        <Muted>
          {meeting.kind} · {new Date(meeting.starts_at).toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })}
          {meeting.location ? ` · ${meeting.location}` : ''}
        </Muted>
        {closed && <Banner text={`Afgerond op ${new Date(meeting.closed_at!).toLocaleString('nl-NL')}`} tone="ok" />}
        <Label>Aanwezig</Label>
        <Chips>
          {members.map((m) => (
            <Chip
              key={m.user_id}
              label={m.full_name}
              selected={present.has(m.user_id)}
              onPress={() =>
                !closed &&
                setPresent((s) => {
                  const n = new Set(s);
                  if (n.has(m.user_id)) n.delete(m.user_id);
                  else n.add(m.user_id);
                  return n;
                })
              }
            />
          ))}
        </Chips>
      </Card>

      {!closed && (
        <Card>
          <H2>Vastleggen</H2>
          {mode ? (
            <>
              <Muted style={{ marginBottom: 8, textAlign: 'center' }}>{mode === 'besluit' ? 'Spreek het besluit in' : 'Spreek de actie in: wie, wat, wanneer'}</Muted>
              <VoiceRecorder
                compact
                hints={members.map((m) => m.full_name)}
                onDone={(r) => record(mode, r.transcript, r.audio ? [r.audio] : [])}
              />
              <Button title="Typen in plaats van inspreken" variant="secondary" small onPress={() => record(mode, '', [])} />
              <Button title="Annuleren" variant="secondary" small onPress={() => setMode(null)} />
            </>
          ) : (
            <Row>
              <Button title="✔ Actie" onPress={() => setMode('actie')} />
              <Button title="⚖ Besluit" variant="secondary" onPress={() => setMode('besluit')} />
            </Row>
          )}
        </Card>
      )}

      <H2>Vastgelegd in dit overleg ({items.length})</H2>
      {items.length === 0 && <Muted>Nog niets vastgelegd.</Muted>}
      {items.map((i) => (
        <ItemCard key={i.id} item={i} members={members} />
      ))}

      <H2>Openstaand uit eerdere overleggen ({openBefore.length})</H2>
      {openBefore.map((i) => (
        <ItemCard key={i.id} item={i} members={members} />
      ))}

      <Card>
        <Label>Verslag en actielijst</Label>
        <Row>
          <Button small title="PDF" variant="secondary" onPress={() => doExport('pdf')} />
          <Button small title="Word" variant="secondary" onPress={() => doExport('docx')} />
        </Row>
        {!closed && (
          <Button
            title="Overleg afronden"
            variant="ok"
            onPress={async () => {
              try {
                await closeMeeting(meeting.id, members.map((m) => ({ user_id: m.user_id, present: present.has(m.user_id) })));
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        )}
      </Card>
    </Screen>
  );
}
