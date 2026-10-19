// Snel melden (FO §5.4/5.5): inspreken, foto's maken, eventueel type vooraf kiezen.
import { useState } from 'react';
import { Alert } from 'react-native';

import { CaptureList } from '../../components/Media';
import { ProjectSwitcher } from '../../components/ProjectSwitcher';
import { Button, Card, Chip, Chips, Field, Label, Muted, Row, Screen } from '../../components/ui';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { ITEM_TYPE_INFO, ITEM_TYPES, ItemType } from '../../domain/types';
import { openDraft } from '../../lib/draft';
import { Capture, pickPhotos, takePhoto } from '../../lib/media';
import { useSession } from '../../lib/session';

export default function Melden() {
  const { project, members } = useSession();
  const [type, setType] = useState<ItemType | undefined>();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [text, setText] = useState('');

  if (!project) return null;
  const hints = members.flatMap((m) => [m.full_name, m.organisation_name ?? '']).filter(Boolean);

  function next(transcript: string, extra: Capture[] = []) {
    openDraft({ projectId: project!.id, text: transcript, captures: [...captures, ...extra], typeHint: type });
    setCaptures([]);
    setText('');
    setType(undefined);
  }

  async function photo(fromLibrary: boolean) {
    try {
      const c = fromLibrary ? await pickPhotos() : await takePhoto();
      if (!c) return;
      setCaptures((x) => [...x, ...(Array.isArray(c) ? c : [c])]);
    } catch (e) {
      Alert.alert('Foto', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <ProjectSwitcher />
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <VoiceRecorder
          hints={hints}
          label="Houd ingedrukt en vertel wat er aan de hand is"
          onDone={(r) => next(r.transcript, r.audio ? [r.audio] : [])}
        />
        <Muted style={{ marginTop: 12, textAlign: 'center' }}>
          Bijv. “Afwijking bij mofput 12, dekking maar 70 cm. Pietersen moet dit vóór donderdag herstellen.”
        </Muted>
      </Card>

      <Card>
        <Label>Foto&apos;s</Label>
        <Row>
          <Button title="📷 Foto maken" onPress={() => photo(false)} small />
          <Button title="🖼 Uit galerij" variant="secondary" onPress={() => photo(true)} small />
        </Row>
        <CaptureList captures={captures} onRemove={(id) => setCaptures((x) => x.filter((c) => c.id !== id))} />
        {captures.length > 0 && <Muted>Spreek nu een toelichting in, of typ hieronder.</Muted>}
      </Card>

      <Card>
        <Label>Type (optioneel)</Label>
        <Chips>
          {ITEM_TYPES.map((t) => (
            <Chip
              key={t}
              label={`${ITEM_TYPE_INFO[t].icon} ${ITEM_TYPE_INFO[t].label}`}
              selected={type === t}
              color={ITEM_TYPE_INFO[t].color}
              onPress={() => setType(type === t ? undefined : t)}
            />
          ))}
        </Chips>
        <Field label="Of typ je melding" value={text} onChangeText={setText} multiline placeholder="Wat wil je melden?" />
        <Button title="Verder" onPress={() => next(text.trim())} disabled={!text.trim() && captures.length === 0} />
      </Card>
    </Screen>
  );
}
