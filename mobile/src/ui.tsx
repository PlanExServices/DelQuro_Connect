import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View, type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openPublicPage, type PublicPage } from './service';

export const colors = {
  navy: '#1B2A4A', teal: '#096A66', tealLight: '#DBEFEB', page: '#EDF3F5',
  card: '#FFFFFF', ink: '#172C43', muted: '#4F6577', line: '#CFDCE3',
  danger: '#9B2340', amber: '#785317',
};

export const ui = StyleSheet.create({
  scroll: { flex: 1, width: '100%' },
  page: { width: '100%', maxWidth: 670, alignSelf: 'center', padding: 18, gap: 14, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.navy, letterSpacing: -0.45 },
  subtitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  status: { color: colors.teal, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: colors.card, padding: 16, gap: 10, borderWidth: 1,
    borderColor: colors.line, borderRadius: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  stack: { gap: 10 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  badge: {
    alignSelf: 'flex-start', backgroundColor: colors.tealLight, borderRadius: 8,
    color: colors.teal, fontSize: 13, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5,
  },
});

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.teal }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessible={false} aria-hidden />;
}

export function Button({ label, onPress, disabled, danger, quiet, icon, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; danger?: boolean; quiet?: boolean;
  icon?: IconName; accessibilityLabel?: string;
}) {
  const fill = danger ? colors.danger : colors.teal;
  const ink = quiet ? fill : colors.card;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.button, {
        backgroundColor: quiet ? colors.card : fill, borderColor: quiet ? colors.line : fill,
        opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
      }]}>
      {icon && <Icon name={icon} size={18} color={ink} />}
      <Text style={[styles.buttonText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.multiline]} {...props} />
    </View>
  );
}

export function Page({ children, refreshing, onRefresh }: {
  children: ReactNode; refreshing?: boolean; onRefresh?: () => void;
}) {
  return <ScrollView style={ui.scroll} contentContainerStyle={ui.page} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}>
    {children}
  </ScrollView>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={[ui.subtitle, { flex: 1 }]}>{title}</Text>
          <Button label="Close" onPress={onClose} quiet />
        </View>
        {children}
      </SafeAreaView>
    </Modal>
  );
}

export function Empty({ label }: { label: string }) {
  return <View style={ui.card}><Text style={ui.muted}>{label}</Text></View>;
}

export function Problem({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return (
    <View style={ui.card}>
      <Text accessibilityRole="alert" style={ui.error}>{message}</Text>
      {retry && <Button label="Try again" onPress={retry} quiet />}
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator accessibilityLabel="Loading" color={colors.teal} style={{ padding: 16 }} />;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await action(); } catch (err) { setError(errorText(err)); } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const reload = useCallback(async (quiet = false) => {
    const attempt = ++generation.current;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const next = await load();
      if (attempt === generation.current) setData(next);
    } catch (err) {
      if (attempt === generation.current) setError(errorText(err));
    } finally {
      if (attempt === generation.current) setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    setData(null);
    void reload();
    return () => { generation.current++; };
  }, [reload]);
  return { data, loading, error, reload };
}

export function PublicLinks({ includeDeletion, workspace }: { includeDeletion?: boolean; workspace?: string | null }) {
  const action = useAction();
  const links: [PublicPage, string][] = [
    ['privacy', 'Privacy policy'], ['support', 'Support'], ['community-guidelines', 'Community guidelines'],
  ];
  if (includeDeletion) links.push(['account-deletion', 'Account deletion help']);
  return (
    <View style={ui.stack}>
      <View style={ui.row}>
        {links.map(([page, label]) =>
          <Button key={page} label={label} quiet onPress={() => void action.run(() => openPublicPage(page, workspace))} />)}
      </View>
      <Problem message={action.error} />
    </View>
  );
}

export function dayLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined,
    options ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timestamp(value: string) {
  if (!value) return '';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' :
    time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
    justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 7, flexShrink: 1,
  },
  buttonText: { fontWeight: '700', fontSize: 14, textAlign: 'center', flexShrink: 1 },
  input: {
    minHeight: 48, backgroundColor: colors.card, color: colors.ink, borderColor: colors.line,
    borderWidth: 1, borderRadius: 12, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10,
    gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card,
  },
});
