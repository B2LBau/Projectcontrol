// Centrale lijst / logboek (FO §5.12) met filters, zoeken, live bijwerken en export.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { ItemCard } from '../../components/ItemCard';
import { ProjectSwitcher } from '../../components/ProjectSwitcher';
import { Button, Chip, Chips, colors, Empty, Label, Muted, Row, styles } from '../../components/ui';
import { ITEM_TYPE_INFO, ITEM_TYPES, Item, ItemType } from '../../domain/types';
import { getItems } from '../../lib/api';
import { pendingItems, useOutbox } from '../../lib/outbox';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { exportReport, Format } from '../../report/export';
import { listReport } from '../../report/model';

type View_ = 'open' | 'alles' | 'gesloten';
type Preset = { label: string; types?: ItemType[]; mine?: boolean; overdue?: boolean; view?: View_ };

const PRESETS: Preset[] = [
  { label: 'Alles open' },
  { label: 'Mijn acties', mine: true },
  { label: 'Te laat', overdue: true },
  { label: 'Besluitenlijst', types: ['besluit'], view: 'alles' },
  { label: 'Actielijst', types: ['actie'] },
  { label: 'Afwijkingen', types: ['afwijking'], view: 'alles' },
];

export default function Lijst() {
  const { project, members, session } = useSession();
  useOutbox(); // opnieuw renderen als de wachtrij verandert
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [view, setView] = useState<View_>('open');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('Alles open');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      setItems(
        await getItems({
          projectId: project.id,
          types,
          open: view === 'open' ? true : view === 'gesloten' ? false : undefined,
          ownerId: mine ? session?.user.id : undefined,
          overdue: overdue || undefined,
          search,
        }),
      );
    } catch (e) {
      Alert.alert('Laden mislukt', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project, types, view, mine, overdue, search, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Live bijwerken bij wijzigingen van anderen
  useEffect(() => {
    if (!project) return;
    const ch = supabase
      .channel(`items-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${project.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [project, load]);

  const pending = project ? pendingItems(project.id) : [];
  const title = useMemo(() => (preset ? preset : 'Logboek'), [preset]);

  function applyPreset(p: Preset) {
    setPreset(p.label);
    setTypes(p.types ?? []);
    setMine(!!p.mine);
    setOverdue(!!p.overdue);
    setView(p.view ?? 'open');
  }

  async function doExport(f: Format) {
    if (!project) return;
    try {
      await exportReport(listReport(title, project, items, members), f);
    } catch (e) {
      Alert.alert('Export mislukt', e instanceof Error ? e.message : String(e));
    }
  }

  if (!project) return null;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      keyboardShouldPersistTaps="handled"
    >
      <ProjectSwitcher />
      <TextInput
        placeholder="Zoeken (ook in ingesproken tekst)"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={load}
        returnKeyType="search"
        style={[styles.input, { marginBottom: 10 }]}
        placeholderTextColor={colors.muted}
      />
      <Chips>
        {PRESETS.map((p) => (
          <Chip key={p.label} label={p.label} selected={preset === p.label} onPress={() => applyPreset(p)} />
        ))}
      </Chips>
      <Chip label={showFilters ? 'Minder filters ▲' : 'Meer filters ▼'} onPress={() => setShowFilters(!showFilters)} />
      <View style={{ height: 10 }} />
      {showFilters && (
        <>
          <Label>Type</Label>
          <Chips>
            {ITEM_TYPES.map((t) => (
              <Chip
                key={t}
                label={ITEM_TYPE_INFO[t].label}
                color={ITEM_TYPE_INFO[t].color}
                selected={types.includes(t)}
                onPress={() => {
                  setPreset('');
                  setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
                }}
              />
            ))}
          </Chips>
          <Chips>
            {(['open', 'gesloten', 'alles'] as View_[]).map((v) => (
              <Chip key={v} label={v === 'open' ? 'Open' : v === 'gesloten' ? 'Afgehandeld' : 'Alle statussen'} selected={view === v} onPress={() => (setPreset(''), setView(v))} />
            ))}
            <Chip label="Aan mij" selected={mine} onPress={() => (setPreset(''), setMine(!mine))} />
            <Chip label="Te laat" selected={overdue} color={colors.danger} onPress={() => (setPreset(''), setOverdue(!overdue))} />
          </Chips>
        </>
      )}
      <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <Muted>
          {items.length} melding{items.length === 1 ? '' : 'en'} · exporteren:
        </Muted>
        <Button title="PDF" small variant="secondary" onPress={() => doExport('pdf')} />
        <Button title="Word" small variant="secondary" onPress={() => doExport('docx')} />
        <Button title="Excel (CSV)" small variant="secondary" onPress={() => doExport('csv')} />
      </Row>

      {pending.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Label>Nog niet verzonden</Label>
          {pending.map((p) => (
            <ItemCard
              key={p.id}
              pending
              members={members}
              item={{
                ...p,
                number: '',
                status: 'nieuw',
                original_due_at: p.due_at,
                created_by: session?.user.id ?? '',
                creator_org_id: null,
                owner_org_id: null,
                created_at: p.captured_at,
                updated_at: p.captured_at,
                closed_at: null,
                withdrawn_reason: null,
              }}
            />
          ))}
        </View>
      )}
      {items.length === 0 && !loading && <Empty title="Geen meldingen gevonden" />}
      {items.map((i) => (
        <ItemCard key={i.id} item={i} members={members} />
      ))}
    </ScrollView>
  );
}
