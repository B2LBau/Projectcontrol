import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Banner, Button, Card, Chip, Chips, colors, Field, H2, Muted, Screen } from '../../components/ui';
import type { Meeting } from '../../domain/types';
import { createMeeting, getMeetings } from '../../lib/api';
import { useSession } from '../../lib/session';

const KINDS = ['bouwoverleg', 'startwerkoverleg', 'werkvoorbereiding', 'toolbox', 'overleg OA', 'overig'];

export default function Meetings() {
  const { project } = useSession();
  const [list, setList] = useState<Meeting[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('bouwoverleg');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [week] = useState(() => Math.ceil((Date.now() - Date.UTC(new Date().getFullYear(), 0, 1)) / 604800000));

  useFocusEffect(
    useCallback(() => {
      if (project) getMeetings(project.id).then(setList).catch(() => {});
    }, [project]),
  );

  if (!project) return null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const id = await createMeeting({ project_id: project!.id, title: title.trim(), kind, location: location.trim() || null });
      router.push(`/meeting/${id}`);
      setTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {error && <Banner text={error} tone="danger" />}
      <Card>
        <H2>Nieuw overleg</H2>
        <Field label="Titel" value={title} onChangeText={setTitle} placeholder={`bijv. Bouwoverleg week ${week}`} />
        <Chips>
          {KINDS.map((k) => (
            <Chip key={k} label={k} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Chips>
        <Field label="Locatie" value={location} onChangeText={setLocation} placeholder="bijv. bouwkeet" />
        <Button title="Overleg starten" onPress={start} busy={busy} disabled={!title.trim()} />
      </Card>
      <H2>Eerdere overleggen</H2>
      {list.length === 0 && <Muted>Nog geen overleggen.</Muted>}
      {list.map((m) => (
        <Pressable key={m.id} onPress={() => router.push(`/meeting/${m.id}`)}>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{m.title}</Text>
            <Muted>
              {m.kind} · {new Date(m.starts_at).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
              {m.closed_at ? ' · afgerond' : ' · open'}
            </Muted>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
