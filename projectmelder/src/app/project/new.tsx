import { router } from 'expo-router';
import { useState } from 'react';

import { Banner, Button, Card, Chip, Chips, Field, Screen } from '../../components/ui';
import { createProject } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function NewProject() {
  const { refresh, selectProject } = useSession();
  const [p, setP] = useState({ code: '', name: '', client: '', location: '' });
  const [role, setRole] = useState<'projectleider' | 'werkvoorbereider'>('projectleider');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const id = await createProject({ ...p, role });
      await refresh();
      selectProject(id);
      router.replace('/project/members');
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
        <Field label="Projectcode" value={p.code} onChangeText={(t) => setP({ ...p, code: t })} autoCapitalize="characters" placeholder="bijv. P2611" />
        <Field label="Projectnaam" value={p.name} onChangeText={(t) => setP({ ...p, name: t })} />
        <Field label="Opdrachtgever" value={p.client} onChangeText={(t) => setP({ ...p, client: t })} />
        <Field label="Locatie" value={p.location} onChangeText={(t) => setP({ ...p, location: t })} />
        <Chips>
          <Chip label="Ik ben projectleider" selected={role === 'projectleider'} onPress={() => setRole('projectleider')} />
          <Chip label="Ik ben werkvoorbereider" selected={role === 'werkvoorbereider'} onPress={() => setRole('werkvoorbereider')} />
        </Chips>
        <Button title="Aanmaken" onPress={save} busy={busy} disabled={!p.code.trim() || !p.name.trim()} />
      </Card>
    </Screen>
  );
}
