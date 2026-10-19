import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../lib/session';
import { Button, colors, H2, Muted } from './ui';

export function ProjectSwitcher() {
  const { projects, project, selectProject } = useSession();
  const [open, setOpen] = useState(false);
  if (!project) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
        accessibilityRole="button"
      >
        <Muted>Project{projects.length > 1 ? ' (tik om te wisselen)' : ''}</Muted>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
          {project.code} – {project.name}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
          <H2>Kies project</H2>
          <ScrollView>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  selectProject(p.id);
                  setOpen(false);
                }}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 2,
                  borderColor: p.id === project.id ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: '700' }}>{p.code}</Text>
                <View>
                  <Muted>
                    {p.name}
                    {p.location ? ` · ${p.location}` : ''}
                  </Muted>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Button title="Sluiten" variant="secondary" onPress={() => setOpen(false)} />
        </SafeAreaView>
      </Modal>
    </>
  );
}
