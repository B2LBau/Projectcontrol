// Deelnemers en uitnodigen op telefoonnummer (FO §5.1, §2).
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, Chips, Field, H2, Label, Muted, Row, Screen } from '../../components/ui';
import { formatPhone, isValidPhone, normalizePhone } from '../../domain/phone';
import { INTERNAL_ROLES, OA_ROLES, Organisation, Role, ROLE_LABELS } from '../../domain/types';
import {
  AccessRequest,
  createOrganisation,
  declineAccessRequest,
  getAccessRequests,
  getInvites,
  getOrganisations,
  inviteMember,
} from '../../lib/api';
import { useSession } from '../../lib/session';

export default function Members() {
  const { project, members, me, refresh } = useSession();
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof getInvites>>>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [form, setForm] = useState({ phone: '', name: '', orgId: '', role: '' as Role | '' });
  const [newOrg, setNewOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'danger' } | null>(null);

  const canInviteAll = !!me && ['projectleider', 'werkvoorbereider', 'uitvoerder'].includes(me.role);
  const canInviteOwn = me?.role === 'oa_werkvoorbereider';

  const load = useCallback(async () => {
    if (!project) return;
    setOrgs(await getOrganisations());
    if (canInviteAll || canInviteOwn) setInvites(await getInvites(project.id));
    if (me && ['projectleider', 'werkvoorbereider'].includes(me.role)) setRequests(await getAccessRequests(project.code));
  }, [project, canInviteAll, canInviteOwn, me]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gegevens worden asynchroon geladen
    void load();
  }, [load]);

  if (!project) return null;
  const selectableOrgs = canInviteAll ? orgs.filter((o) => o.kind !== 'opdrachtgever') : orgs.filter((o) => o.id === me?.organisation_id);
  const org = orgs.find((o) => o.id === form.orgId);
  const roles = org ? (org.kind === 'eigen' ? INTERNAL_ROLES : OA_ROLES) : [];

  async function invite() {
    setBusy(true);
    setMsg(null);
    try {
      await inviteMember({ projectId: project!.id, phone: form.phone, name: form.name.trim(), role: form.role as Role, orgId: form.orgId });
      setMsg({ text: `${form.name} uitgenodigd op ${formatPhone(normalizePhone(form.phone))}. Bij eerste inlog met dit nummer wordt de toegang automatisch gekoppeld.`, tone: 'ok' });
      setForm({ phone: '', name: '', orgId: form.orgId, role: '' });
      await refresh();
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H2>
        {project.code} – {members.length} deelnemers
      </H2>
      {msg && <Banner text={msg.text} tone={msg.tone} />}
      {members.map((m) => (
        <Card key={m.user_id} style={{ paddingVertical: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>{m.full_name || 'Nog geen naam'}</Text>
          <Muted>
            {ROLE_LABELS[m.role]} · {m.organisation_name ?? ''} · {formatPhone(m.phone)}
          </Muted>
        </Card>
      ))}

      {requests.length > 0 && (
        <Card>
          <H2>Toegangsaanvragen</H2>
          {requests.map((r) => (
            <View key={r.id} style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: '700' }}>
                {r.full_name || 'Onbekend'} · {formatPhone(r.phone)}
              </Text>
              {r.note ? <Muted>{r.note}</Muted> : null}
              <Row>
                <Button small title="Uitnodigen" onPress={() => setForm({ ...form, phone: r.phone, name: r.full_name })} />
                <Button small variant="secondary" title="Weigeren" onPress={() => declineAccessRequest(r.id).then(load).catch((e) => Alert.alert('Fout', String(e)))} />
              </Row>
            </View>
          ))}
        </Card>
      )}

      {(canInviteAll || canInviteOwn) && (
        <Card>
          <H2>Uitnodigen</H2>
          <Field label="Mobiel nummer" keyboardType="phone-pad" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} placeholder="06 12345678" />
          <Field label="Naam" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
          <Label>Organisatie</Label>
          <Chips>
            {selectableOrgs.map((o) => (
              <Chip key={o.id} label={`${o.name}${o.kind === 'eigen' ? ' (eigen)' : ''}`} selected={form.orgId === o.id} onPress={() => setForm({ ...form, orgId: o.id, role: '' })} />
            ))}
          </Chips>
          {canInviteAll && (
            <Row style={{ marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Nieuwe onderaannemer" value={newOrg} onChangeText={setNewOrg} placeholder="Bedrijfsnaam" />
              </View>
              <Button
                small
                title="Toevoegen"
                disabled={!newOrg.trim()}
                onPress={async () => {
                  try {
                    const id = await createOrganisation(newOrg.trim(), 'onderaannemer');
                    setNewOrg('');
                    setOrgs(await getOrganisations());
                    setForm({ ...form, orgId: id, role: '' });
                  } catch (e) {
                    Alert.alert('Fout', String(e));
                  }
                }}
              />
            </Row>
          )}
          {roles.length > 0 && (
            <>
              <Label>Rol</Label>
              <Chips>
                {roles.map((r) => (
                  <Chip key={r} label={ROLE_LABELS[r]} selected={form.role === r} onPress={() => setForm({ ...form, role: r })} />
                ))}
              </Chips>
            </>
          )}
          <Button title="Uitnodigen" onPress={invite} busy={busy} disabled={!isValidPhone(form.phone) || !form.name.trim() || !form.orgId || !form.role} />
        </Card>
      )}

      {invites.filter((i) => !i.accepted_at).length > 0 && (
        <Card>
          <H2>Openstaande uitnodigingen</H2>
          {invites
            .filter((i) => !i.accepted_at)
            .map((i) => (
              <Muted key={i.id}>
                {i.full_name} · {formatPhone(i.phone)} · {ROLE_LABELS[i.role as Role]}
              </Muted>
            ))}
        </Card>
      )}
    </Screen>
  );
}
