// Centrale lijst / logboek (FO §5.12): per project of over alle projecten, als kaarten (mobiel)
// of sorteerbare tabel (desktop), met filters, zoeken, kerncijfers, live bijwerken en export.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ItemCard } from '../../components/ItemCard';
import { ItemTable } from '../../components/ItemTable';
import { ProjectSwitcher } from '../../components/ProjectSwitcher';
import { Button, Chip, Chips, colors, Empty, Label, Muted, Row, styles } from '../../components/ui';
import { itemStats, SortDir, SortKey, sortItems } from '../../domain/overview';
import { ITEM_TYPE_INFO, ITEM_TYPES, Item, ItemType, Member, Project } from '../../domain/types';
import { getItems, getMembersFor } from '../../lib/api';
import { pendingItems, useOutbox } from '../../lib/outbox';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { exportReport, Format } from '../../report/export';
import { listReport } from '../../report/model';

type View_ = 'open' | 'alles' | 'gesloten';
type Scope = 'project' | 'alle';
type Layout = 'kaarten' | 'tabel';
type Preset = { label: string; types?: ItemType[]; mine?: boolean; overdue?: boolean; view?: View_ };

const PRESETS: Preset[] = [
  { label: 'Alles open' },
  { label: 'Mijn acties', mine: true },
  { label: 'Te laat', overdue: true },
  { label: 'Besluitenlijst', types: ['besluit'], view: 'alles' },
  { label: 'Actielijst', types: ['actie'] },
  { label: 'Afwijkingen', types: ['afwijking'], view: 'alles' },
];

const PREFS_KEY = 'projectmelder.lijst';
const WIDE = 900;

function Stat({ label, value, color, onPress, compact }: { label: string; value: number; color: string; onPress?: () => void; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.stat, { borderTopColor: color }, compact && st.statCompact]} accessibilityRole="button">
      <Text style={[st.statValue, { color }, compact && { fontSize: 20 }]}>{value}</Text>
      <Muted style={compact ? { fontSize: 12 } : undefined}>{label}</Muted>
    </Pressable>
  );
}

export default function Lijst() {
  const { project, projects, members, session } = useSession();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  useOutbox(); // opnieuw renderen als de wachtrij verandert

  const [items, setItems] = useState<Item[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [view, setView] = useState<View_>('open');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('Alles open');
  const [showFilters, setShowFilters] = useState(false);
  const [scope, setScope] = useState<Scope>('project');
  const [onlyProjects, setOnlyProjects] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Weergavekeuzes onthouden per toestel/browser
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as { scope?: Scope; layout?: Layout; sortKey?: SortKey; sortDir?: SortDir };
        if (p.scope) setScope(p.scope);
        if (p.layout) setLayout(p.layout);
        if (p.sortKey) setSortKey(p.sortKey);
        if (p.sortDir) setSortDir(p.sortDir);
      })
      .catch(() => {});
  }, []);
  const savePrefs = (p: { scope?: Scope; layout?: Layout | null; sortKey?: SortKey; sortDir?: SortDir }) => {
    const next = { scope, layout, sortKey, sortDir, ...p };
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const all = scope === 'alle';
  const effectiveLayout: Layout = layout ?? (wide ? 'tabel' : 'kaarten');
  const visibleProjectIds = useMemo(
    () => (all ? (onlyProjects.length ? onlyProjects : projects.map((p) => p.id)) : project ? [project.id] : []),
    [all, onlyProjects, projects, project],
  );

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const filter = {
        types,
        open: view === 'open' ? true : view === 'gesloten' ? false : undefined,
        ownerId: mine ? session?.user.id : undefined,
        overdue: overdue || undefined,
        search,
      };
      setItems(await getItems(all ? { ...filter, projectIds: onlyProjects.length ? onlyProjects : undefined } : { ...filter, projectId: project.id }));
    } catch (e) {
      Alert.alert('Laden mislukt', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project, all, onlyProjects, types, view, mine, overdue, search, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Namen van deelnemers uit alle projecten (alleen nodig bij "Alle projecten")
  useEffect(() => {
    if (!all) return;
    getMembersFor(projects.map((p) => p.id))
      .then(setAllMembers)
      .catch(() => {});
  }, [all, projects]);

  // Live bijwerken bij wijzigingen van anderen (rijbeveiliging bepaalt wat binnenkomt)
  useEffect(() => {
    if (!project) return;
    const ch = supabase
      .channel(all ? 'items-alle' : `items-${project.id}`)
      .on(
        'postgres_changes',
        all ? { event: '*', schema: 'public', table: 'items' } : { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${project.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [project, all, load]);

  const nameMembers = all ? allMembers : members;
  const ownerName = useCallback((id: string | null) => nameMembers.find((m) => m.user_id === id)?.full_name ?? (id ? 'Onbekend' : '–'), [nameMembers]);
  const projectCode = useCallback((id: string) => projects.find((p) => p.id === id)?.code ?? '', [projects]);
  const sorted = useMemo(() => sortItems(items, sortKey, sortDir, { ownerName, projectCode }), [items, sortKey, sortDir, ownerName, projectCode]);
  const stats = useMemo(() => itemStats(items, new Date()), [items]);

  const pending = visibleProjectIds.flatMap((id) => pendingItems(id));
  const title = preset || 'Logboek';

  function applyPreset(p: Preset) {
    setPreset(p.label);
    setTypes(p.types ?? []);
    setMine(!!p.mine);
    setOverdue(!!p.overdue);
    setView(p.view ?? 'open');
  }

  function onSort(k: SortKey) {
    const dir: SortDir = k === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : k === 'severity' || k === 'created' ? 'desc' : 'asc';
    setSortKey(k);
    setSortDir(dir);
    savePrefs({ sortKey: k, sortDir: dir });
  }

  async function doExport(f: Format) {
    if (!project) return;
    const target: Project = all
      ? { id: 'alle', code: 'Alle projecten', name: onlyProjects.length ? onlyProjects.map(projectCode).join(', ') : `${projects.length} projecten`, client: null, location: null, created_at: '' }
      : project;
    try {
      await exportReport(listReport(title, target, sorted, nameMembers), f);
    } catch (e) {
      Alert.alert('Export mislukt', e instanceof Error ? e.message : String(e));
    }
  }

  if (!project) return null;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, maxWidth: effectiveLayout === 'tabel' ? 1500 : 1100, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      keyboardShouldPersistTaps="handled"
    >
      <Row style={{ flexWrap: 'wrap', marginBottom: 6 }}>
        <Chip label="Dit project" selected={!all} onPress={() => (setScope('project'), savePrefs({ scope: 'project' }))} />
        <Chip label={`Alle projecten (${projects.length})`} selected={all} onPress={() => (setScope('alle'), savePrefs({ scope: 'alle' }))} />
        <View style={{ flex: 1 }} />
        <Chip label="▦ Tabel" selected={effectiveLayout === 'tabel'} onPress={() => (setLayout('tabel'), savePrefs({ layout: 'tabel' }))} />
        <Chip label="☰ Kaarten" selected={effectiveLayout === 'kaarten'} onPress={() => (setLayout('kaarten'), savePrefs({ layout: 'kaarten' }))} />
      </Row>
      <View style={{ height: 8 }} />

      {all ? (
        projects.length > 1 && (
          <Chips>
            {projects.map((p) => (
              <Chip
                key={p.id}
                label={p.code}
                selected={onlyProjects.includes(p.id)}
                onPress={() => setOnlyProjects((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
              />
            ))}
            {onlyProjects.length > 0 && <Chip label="Alle tonen" onPress={() => setOnlyProjects([])} />}
          </Chips>
        )
      ) : (
        <ProjectSwitcher />
      )}

      <View style={st.stats}>
        <Stat compact={!wide} label="Open" value={stats.open} color={colors.primary} onPress={() => applyPreset(PRESETS[0])} />
        <Stat compact={!wide} label="Te laat" value={stats.overdue} color={colors.danger} onPress={() => applyPreset(PRESETS[2])} />
        <Stat compact={!wide} label="Vandaag" value={stats.dueToday} color={colors.warn} />
        <Stat compact={!wide} label={wide ? 'Ernst hoog/kritiek' : 'Urgent'} value={stats.urgent} color="#7C2D12" />
      </View>

      <TextInput
        placeholder="Zoeken (nummer, titel, locatie, ingesproken tekst)"
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
        <Chip label={showFilters ? 'Minder filters ▲' : 'Meer filters ▼'} onPress={() => setShowFilters(!showFilters)} />
      </Chips>
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
              members={nameMembers}
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
      {items.length > 0 &&
        (effectiveLayout === 'tabel' ? (
          <ItemTable items={sorted} showProject={all} sortKey={sortKey} sortDir={sortDir} onSort={onSort} ownerName={ownerName} projectCode={projectCode} />
        ) : (
          sorted.map((i) => (
            <View key={i.id}>
              {all && <Muted style={{ marginBottom: 2 }}>{projectCode(i.project_id)}</Muted>}
              <ItemCard item={i} members={nameMembers} />
            </View>
          ))
        ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stat: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
    padding: 12,
  },
  statCompact: { flexBasis: 70, padding: 8 },
  statValue: { fontSize: 26, fontWeight: '800' },
});
