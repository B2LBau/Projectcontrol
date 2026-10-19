import { useState } from 'react';

import { Banner, Button, Card, Field, Muted, Screen } from '../components/ui';
import { formatPhone } from '../domain/phone';
import { updateProfile } from '../lib/api';
import { useSession } from '../lib/session';

export default function Profile() {
  const { session, profile, refresh } = useSession();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [job, setJob] = useState(profile?.job_title ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Screen>
      {msg && <Banner text={msg} tone="ok" />}
      <Card>
        <Muted style={{ marginBottom: 12 }}>
          Telefoonnummer {formatPhone(profile?.phone ?? '')} – hiermee word je herkend. Een nieuw nummer laat je via de
          projectleider overzetten.
        </Muted>
        <Field label="Naam" value={name} onChangeText={setName} />
        <Field label="Functie" value={job} onChangeText={setJob} />
        <Button
          title="Opslaan"
          disabled={!name.trim()}
          onPress={async () => {
            await updateProfile(session!.user.id, { full_name: name.trim(), job_title: job.trim() || null });
            await refresh();
            setMsg('Opgeslagen');
          }}
        />
      </Card>
    </Screen>
  );
}
