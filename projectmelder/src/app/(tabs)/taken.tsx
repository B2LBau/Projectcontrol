// Mijn taken (FO §3.2): alles wat aan mij is toegewezen of op mijn reactie wacht, gesorteerd op termijn.
import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';

import { ItemCard } from '../../components/ItemCard';
import { colors, Empty, H2, Muted } from '../../components/ui';
import { Bucket, BUCKET_LABELS, bucketFor } from '../../domain/deadlines';
import type { Item } from '../../domain/types';
import { getMyTasks } from '../../lib/api';
import { useSession } from '../../lib/session';

const ORDER: Bucket[] = ['te_laat', 'vandaag', 'deze_week', 'later', 'geen'];

export default function Taken() {
  const { session, members, projects } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setItems(await getMyTasks(session.user.id));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const now = new Date();
  const waiting = items.filter((i) => i.owner_id !== session?.user.id);
  const mine = items.filter((i) => i.owner_id === session?.user.id);
  const groups = ORDER.map((b) => ({
    b,
    list: mine
      .filter((i) => bucketFor(i.due_at ? new Date(i.due_at) : null, now) === b)
      .sort((x, y) => (x.due_at ?? '9').localeCompare(y.due_at ?? '9')),
  })).filter((g) => g.list.length);
  const code = (pid: string) => (projects.length > 1 ? projects.find((p) => p.id === pid)?.code : null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, maxWidth: 900, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {items.length === 0 && !loading && <Empty title="Geen openstaande taken">{<Muted>Alles is bij.</Muted>}</Empty>}
      {waiting.length > 0 && (
        <>
          <H2>Wacht op mij (accepteren/beoordelen)</H2>
          {waiting.map((i) => (
            <ItemCard key={i.id} item={i} members={members} />
          ))}
        </>
      )}
      {groups.map((g) => (
        <Fragment key={g.b}>
          <H2>
            {BUCKET_LABELS[g.b]} ({g.list.length})
          </H2>
          {g.list.map((i) => (
            <Fragment key={i.id}>
              {code(i.project_id) && <Muted>{code(i.project_id)}</Muted>}
              <ItemCard item={i} members={members} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </ScrollView>
  );
}
