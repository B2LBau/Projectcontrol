import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ProjectSwitcher } from '../../components/ProjectSwitcher';
import { Button, Card, colors, Muted, Screen } from '../../components/ui';
import { formatPhone } from '../../domain/phone';
import { ROLE_LABELS } from '../../domain/types';
import { useOutbox } from '../../lib/outbox';
import { useSession } from '../../lib/session';

function Link({ title, sub, to }: { title: string; sub?: string; to: string }) {
  return (
    <Pressable onPress={() => router.push(to as never)} style={({ pressed }) => [s.link, pressed && { opacity: 0.8 }]}>
      <Text style={s.title}>{title}</Text>
      {sub ? <Muted>{sub}</Muted> : null}
    </Pressable>
  );
}

export default function Meer() {
  const { profile, me, signOut } = useSession();
  const outbox = useOutbox();
  const isInternalLead = me?.role === 'projectleider' || me?.role === 'werkvoorbereider';
  return (
    <Screen>
      <ProjectSwitcher />
      <Card>
        <Text style={s.title}>{profile?.full_name}</Text>
        <Muted>
          {formatPhone(profile?.phone ?? '')}
          {me ? ` · ${ROLE_LABELS[me.role]}${me.organisation_name ? ` · ${me.organisation_name}` : ''}` : ''}
        </Muted>
      </Card>
      <Link title="Overleggen" sub="Acties en besluiten vastleggen, verslag maken" to="/meeting" />
      <Link title="Deelnemers" sub="Wie zit in dit project, uitnodigen op telefoonnummer" to="/project/members" />
      {isInternalLead && <Link title="Nieuw project" to="/project/new" />}
      <Link
        title={`Wachtrij${outbox.length ? ` (${outbox.length})` : ''}`}
        sub={outbox.length ? 'Nog niet verzonden meldingen en foto’s' : 'Alles is verzonden'}
        to="/outbox"
      />
      <Link title="Profiel" sub="Naam en functie" to="/profile" />
      <Button title="Uitloggen" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const s = StyleSheet.create({
  link: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    minHeight: 64,
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
});
