// Eerste gebruik: naam invullen, eventueel organisatie inrichten of eerste project aanmaken.
// Onbekende nummers krijgen geen toegang en kunnen toegang aanvragen (FO §5.1).
import { useEffect, useState } from 'react';

import { Banner, Button, Card, Chip, Chips, Field, H1, H2, Muted, Screen } from '../components/ui';
import { formatPhone } from '../domain/phone';
import type { Organisation } from '../domain/types';
import { bootstrapOrganisation, createProject, getOrganisations, requestAccess, updateProfile } from '../lib/api';
import { useSession } from '../lib/session';

export default function Onboarding() {
  const { session, profile, refresh, signOut } = useSession();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [job, setJob] = useState(profile?.job_title ?? '');
  const [orgs, setOrgs] = useState<Organisation[] | null>(null);
  const [orgName, setOrgName] = useState('');
  const [p, setP] = useState({ code: '', name: '', client: '', location: '' });
  const [role, setRole] = useState<'projectleider' | 'werkvoorbereider'>('projectleider');
  const [req, setReq] = useState({ code: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'danger' } | null>(null);

  useEffect(() => {
    getOrganisations().then(setOrgs).catch(() => setOrgs([]));
  }, [profile?.organisation_id]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ text: ok, tone: 'ok' });
      await refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const myOrg = orgs?.find((o) => o.id === profile?.organisation_id);
  const noOwnOrg = orgs !== null && !orgs.some((o) => o.kind === 'eigen');

  return (
    <Screen>
      <H1>Welkom</H1>
      <Muted style={{ marginBottom: 12 }}>Ingelogd met {formatPhone(profile?.phone ?? session?.user.phone ?? '')}</Muted>
      {msg && <Banner text={msg.text} tone={msg.tone} />}

      <Card>
        <H2>Jouw gegevens</H2>
        <Field label="Naam" value={name} onChangeText={setName} placeholder="Voor- en achternaam" />
        <Field label="Functie" value={job} onChangeText={setJob} placeholder="bijv. uitvoerder" />
        <Button
          title="Opslaan"
          onPress={() => run(() => updateProfile(session!.user.id, { full_name: name.trim(), job_title: job.trim() || null }), 'Opgeslagen')}
          disabled={!name.trim()}
          busy={busy}
        />
      </Card>

      {!!profile?.full_name && noOwnOrg && (
        <Card>
          <H2>Organisatie inrichten</H2>
          <Muted style={{ marginBottom: 8 }}>
            Er is nog geen organisatie. Als eerste gebruiker richt je de eigen organisatie in en word je beheerder.
          </Muted>
          <Field label="Naam organisatie" value={orgName} onChangeText={setOrgName} />
          <Button title="Inrichten" onPress={() => run(async () => void (await bootstrapOrganisation(orgName.trim())))} disabled={!orgName.trim()} busy={busy} />
        </Card>
      )}

      {!!profile?.full_name && myOrg?.kind === 'eigen' && (
        <Card>
          <H2>Eerste project aanmaken</H2>
          <Field label="Projectcode" value={p.code} onChangeText={(t) => setP({ ...p, code: t })} placeholder="bijv. P2611" autoCapitalize="characters" />
          <Field label="Projectnaam" value={p.name} onChangeText={(t) => setP({ ...p, name: t })} />
          <Field label="Opdrachtgever" value={p.client} onChangeText={(t) => setP({ ...p, client: t })} />
          <Field label="Locatie" value={p.location} onChangeText={(t) => setP({ ...p, location: t })} />
          <Chips>
            <Chip label="Ik ben projectleider" selected={role === 'projectleider'} onPress={() => setRole('projectleider')} />
            <Chip label="Ik ben werkvoorbereider" selected={role === 'werkvoorbereider'} onPress={() => setRole('werkvoorbereider')} />
          </Chips>
          <Button
            title="Project aanmaken"
            onPress={() => run(async () => void (await createProject({ ...p, role })))}
            disabled={!p.code.trim() || !p.name.trim()}
            busy={busy}
          />
        </Card>
      )}

      {!!profile?.full_name && !noOwnOrg && myOrg?.kind !== 'eigen' && (
        <Card>
          <H2>Nog geen toegang</H2>
          <Muted style={{ marginBottom: 8 }}>
            Je nummer is nog niet uitgenodigd voor een project. Vraag de projectleider of werkvoorbereider je uit te nodigen
            op dit nummer, of vraag hieronder toegang aan.
          </Muted>
          <Button title="Opnieuw controleren" variant="secondary" onPress={() => run(async () => {})} busy={busy} />
          <Field label="Projectcode" value={req.code} onChangeText={(t) => setReq({ ...req, code: t })} autoCapitalize="characters" />
          <Field label="Toelichting" value={req.note} onChangeText={(t) => setReq({ ...req, note: t })} placeholder="bijv. voorman De Vries Infra" />
          <Button
            title="Toegang aanvragen"
            onPress={() => run(() => requestAccess(req.code, req.note), 'Aanvraag verstuurd')}
            disabled={!req.code.trim()}
            busy={busy}
          />
        </Card>
      )}

      <Button title="Uitloggen" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
