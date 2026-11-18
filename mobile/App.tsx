import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { clearAttachmentCache } from './src/Attachment';
import { Chat } from './src/Chat';
import { demoOrigin, origin } from './src/service';
import { SafetySheet, Settings } from './src/Settings';
import { SignIn } from './src/SignIn';
import type { ReportTarget } from './src/types';
import { Button, colors, Icon, Loading, Page, Problem, ui } from './src/ui';
import { useSession } from './src/useSession';
import { Huddle, Schedules, TimeOff } from './src/Workspace';

const tabs = [
  { name: 'Huddle', icon: 'megaphone-outline' },
  { name: 'Time Off', icon: 'calendar-outline' },
  { name: 'Schedule', icon: 'clipboard-outline' },
  { name: 'Chat', icon: 'chatbubbles-outline' },
] as const;
type Tab = typeof tabs[number]['name'];

function Workspace({ session }: { session: ReturnType<typeof useSession> }) {
  const [active, setActive] = useState<Tab>('Huddle');
  const [settings, setSettings] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [revision, setRevision] = useState(0);
  const account = session.account;
  if (!account) return null;
  const inputs = { api: session.api, request: session.request, safety: setReport, userId: account.id };
  const inbox = {
    Huddle: <Huddle {...inputs} />,
    'Time Off': <TimeOff api={session.api} />,
    Schedule: <Schedules {...inputs} />,
    Chat: <Chat {...inputs} account={account} acceptTerms={session.acceptTerms} workspace={session.workspace} />,
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.mark}><Icon name="pulse" color={colors.card} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>DelQuro Connect</Text>
            {!!account.campus && <Text style={styles.campus}>{account.campus}</Text>}
          </View>
        </View>
        <Pressable style={styles.settings} accessibilityRole="button" accessibilityLabel="Settings"
          onPress={() => setSettings(true)}>
          <Icon name="settings-outline" color={colors.card} size={23} />
        </Pressable>
      </View>
      {account.account_deletion_pending ? (
        <Page>
          <Problem message="Your account deletion is pending." />
          <Button label="Open account settings" onPress={() => setSettings(true)} />
        </Page>
      ) : (
        <>
          <View style={{ flex: 1 }} key={revision}>{inbox[active]}</View>
          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map(tab => (
              <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.name}
                accessibilityState={{ selected: tab.name === active }}
                onPress={() => setActive(tab.name)} style={[styles.tab, tab.name === active && styles.activeTab]}>
                <Icon name={tab.icon} color={tab.name === active ? colors.teal : colors.muted} />
                <Text style={[styles.tabText, tab.name === active && { color: colors.teal }]}>{tab.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {settings && <Settings session={session} onClose={() => setSettings(false)} onBlocksChanged={() => setRevision(n => n + 1)} />}
      {report && <SafetySheet target={report} userId={account.id} api={session.api} onClose={() => setReport(null)}
        onBlock={() => { setReport(null); setRevision(n => n + 1); }} />}
    </>
  );
}

function Connect({ demo, switchWorkspace }: { demo: boolean; switchWorkspace?: () => void }) {
  const workspace = demo ? demoOrigin : origin;
  const session = useSession(workspace);
  const accountId = session.account?.id;
  useEffect(() => {
    if (!accountId) clearAttachmentCache();
    return () => { if (accountId) clearAttachmentCache(); };
  }, [accountId]);
  let content;
  if (!origin) {
    content = <Page>
      <Text accessibilityRole="header" style={ui.title}>DelQuro Connect</Text>
      <Problem message="This build has no Connect service configured. Contact your workspace administrator for the current build." />
    </Page>;
  } else if (session.starting) {
    content = <Loading />;
  } else if (session.startupError) {
    content = <Page><Problem message={session.startupError} retry={session.initialize} /></Page>;
  } else {
    content = session.account ? <Workspace key={accountId} session={session} /> :
      <SignIn session={session} demo={demo} switchWorkspace={switchWorkspace} />;
  }
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  const [demo, setDemo] = useState(false);
  return <SafeAreaProvider><StatusBar style="dark" />
    <Connect key={demo ? 'demo' : 'team'} demo={demo}
      switchWorkspace={demoOrigin ? () => setDemo(demo => !demo) : undefined} />
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  header: {
    backgroundColor: colors.navy, paddingHorizontal: 18, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  mark: { backgroundColor: colors.teal, borderRadius: 12, width: 39, height: 39, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 18, color: colors.card, fontWeight: '800' },
  campus: { fontSize: 13, color: '#D6E7EC', marginTop: 2 },
  settings: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row', backgroundColor: colors.card, borderTopColor: colors.line,
    borderTopWidth: 1, padding: 6, gap: 3,
  },
  tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 11, padding: 3 },
  activeTab: { backgroundColor: colors.tealLight },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
