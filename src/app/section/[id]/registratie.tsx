import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';

import { Button, Card, Choice, colors, Field, H2, Muted, Screen, StatusBadge } from '../../../components/ui';
import { signature } from '../../../domain/roles';
import { evaluateRegistration, getRequirement, resolveParams } from '../../../domain/requirements';
import type { GeoPoint, InputDef, InputValues } from '../../../domain/types';
import { currentPosition, formatPosition } from '../../../services/location';
import { deletePhotos, takePhoto } from '../../../services/photos';
import { useStore } from '../../../storage/store';

function parseNumber(v: string): number | undefined {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

function Input({
  def,
  raw,
  onChange,
}: {
  def: InputDef;
  raw: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  switch (def.kind) {
    case 'number':
      return (
        <Field
          label={def.label}
          unit={def.unit}
          placeholder={def.hint}
          keyboardType="numbers-and-punctuation"
          value={typeof raw === 'string' ? raw : ''}
          onChangeText={onChange}
        />
      );
    case 'text':
      return <Field label={def.label} placeholder={def.hint} value={typeof raw === 'string' ? raw : ''} onChangeText={onChange} />;
    case 'select':
      return <Choice label={def.label} value={typeof raw === 'string' ? raw : undefined} options={def.options} onChange={onChange} />;
    case 'boolean':
      return (
        <Choice
          label={def.label}
          value={typeof raw === 'boolean' ? raw : undefined}
          options={[
            { value: true, label: 'Ja' },
            { value: false, label: 'Nee' },
          ]}
          onChange={onChange}
        />
      );
  }
}

export default function RegistrationScreen() {
  const { id, checkId } = useLocalSearchParams<{ id: string; checkId: string }>();
  const { data, addRegistration } = useStore();
  const section = data.sections.find((s) => s.id === id);
  const project = data.projects.find((p) => p.id === section?.projectId);
  const req = getRequirement(checkId);
  const params = resolveParams(req, project?.paramOverrides[req.id]);

  const [raw, setRaw] = useState<Record<string, string | boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    currentPosition()
      .then(setPosition)
      .finally(() => setLocating(false));
  }, []);

  // Foto's die genomen zijn maar niet bij een opgeslagen registratie horen, opruimen.
  const pending = useRef<{ photos: string[]; saved: boolean }>({ photos: [], saved: false });
  useEffect(() => {
    pending.current.photos = photos;
  }, [photos]);
  useEffect(
    () => () => {
      if (!pending.current.saved) deletePhotos(pending.current.photos);
    },
    [],
  );

  const values: InputValues = {};
  for (const def of req.inputs) {
    const r = raw[def.key];
    if (r === undefined) continue;
    values[def.key] = def.kind === 'number' ? parseNumber(String(r)) : r;
  }

  const evaluation = evaluateRegistration(req, values, params, photos.length);

  const addPhoto = async () => {
    try {
      const uri = await takePhoto();
      if (uri) setPhotos((p) => [...p, uri]);
    } catch (e) {
      Alert.alert('Foto mislukt', e instanceof Error ? e.message : String(e));
    }
  };

  const save = () => {
    if (!section) return;
    const store = () => {
      addRegistration({
        sectionId: section.id,
        checkId: req.id,
        values,
        params,
        evaluation,
        photos,
        location: position,
        recordedBy: signature(data.settings),
        recordedAt: new Date().toISOString(),
        remark: remark.trim(),
      });
      pending.current.saved = true;
      router.back();
    };
    if (evaluation.status === 'voldoet_niet') {
      Alert.alert('Eis niet gehaald', 'De registratie wordt opgeslagen als afwijking. Herstel en registreer daarna opnieuw.', [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Opslaan als afwijking', style: 'destructive', onPress: store },
      ]);
    } else {
      store();
    }
  };

  if (!section) return <Screen><Muted>Tracédeel niet gevonden.</Muted></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: req.title }} />
      <Card>
        <Text style={{ fontSize: 15 }}>{req.description}</Text>
        <Muted>
          {section.name} · Bron: {req.reference}
        </Muted>
      </Card>

      <Card>
        {req.inputs.map((def) => (
          <Input key={def.key} def={def} raw={raw[def.key]} onChange={(v) => setRaw((r) => ({ ...r, [def.key]: v }))} />
        ))}
      </Card>

      <Card>
        <H2>Foto’s {req.minPhotos ? `(min. ${req.minPhotos})` : '(optioneel)'}</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((uri) => (
            <Pressable
              key={uri}
              onLongPress={() => {
                deletePhotos([uri]);
                setPhotos((p) => p.filter((u) => u !== uri));
              }}
            >
              <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: 6 }} />
            </Pressable>
          ))}
        </View>
        {photos.length ? <Muted>Lang indrukken om een foto te verwijderen.</Muted> : null}
        <Muted>Fotografeer de meting met meetlat/duimstok goed zichtbaar in beeld.</Muted>
        <Button title="📷 Foto maken" variant="secondary" onPress={addPhoto} />
      </Card>

      <Card>
        <Field label="Opmerking" value={remark} onChangeText={setRemark} multiline />
        <Muted>
          Positie: {locating ? 'bepalen…' : formatPosition(position)} · Vastgelegd door: {signature(data.settings)}
        </Muted>
        {locating ? <ActivityIndicator color={colors.primary} /> : null}
      </Card>

      <Card style={{ borderColor: evaluation.status === 'voldoet' ? colors.ok : evaluation.status === 'voldoet_niet' ? colors.fail : colors.border, borderWidth: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H2>Toetsing</H2>
          <StatusBadge status={evaluation.status} />
        </View>
        {evaluation.details.map((d, i) => (
          <Text key={i} style={{ fontSize: 15 }}>
            {d}
          </Text>
        ))}
      </Card>

      <Button title="Registratie opslaan" disabled={evaluation.status === 'onvolledig' && Object.keys(values).length === 0} onPress={save} />
    </Screen>
  );
}
