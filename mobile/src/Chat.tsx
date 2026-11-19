import { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AttachmentButton } from './Attachment';
import { TermsCheck } from './SignIn';
import type { Account, Conversation, Message } from './types';
import { Button, colors, Empty, Field, Icon, Loading, Page, Problem, PublicLinks, timestamp, ui, useAction, useResource } from './ui';
import type { WorkspaceProps } from './Workspace';

function useForegroundRefresh(reload: (quiet?: boolean) => Promise<void>, interval: number) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void reload(true);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void reload(true);
    }, interval);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [reload, interval]);
}

type ChatProps = WorkspaceProps & { account: Account; acceptTerms: () => Promise<void>; workspace: string | null };

function Thread({ thread, onBack, ...props }: ChatProps & { thread: Conversation; onBack: () => void }) {
  const { api, request, account, acceptTerms, safety } = props;
  const [text, setText] = useState('');
  const [accepted, setAccepted] = useState(false);
  const action = useAction();
  const path = `/chats/${thread.id}`;
  const load = useCallback(async () => {
    const latest = await api<Message[]>(`${path}/messages`);
    if (latest.some(message => message.sender_id !== account.id && !message.read_by.includes(account.id))) {
      await api(`${path}/read`, 'POST').catch(() => undefined);
    }
    return latest.reverse();
  }, [api, path, account.id]);
  const messages = useResource(load);
  useForegroundRefresh(messages.reload, 7000);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  function send() {
    if (!text.trim()) return;
    void action.run(async () => {
      await api(`${path}/messages`, 'POST', { text: text.trim() });
      setText('');
      await messages.reload(true);
    });
  }

  return (
    <View style={styles.thread}>
      <View style={styles.threadHeader}>
        <Button label="Chats" quiet icon="chevron-back" onPress={onBack} />
        <Text accessibilityRole="header" style={[ui.subtitle, { flex: 1 }]}>{thread.name}</Text>
      </View>
      <Problem message={messages.error} retry={messages.reload} />
      {messages.loading && !messages.data && <Loading />}
      {messages.data?.length === 0 && <Empty label="Start the conversation with your team." />}
      <FlatList style={{ flex: 1, width: '100%' }} contentContainerStyle={{ padding: 12, gap: 10 }}
        inverted data={messages.data ?? []} keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled" refreshing={messages.loading} onRefresh={() => void messages.reload()}
        renderItem={({ item }) => (
          <View style={[styles.message, item.sender_id === account.id && styles.mine]}>
            <Text style={ui.label}>{item.sender_id === account.id ? 'You' : item.sender_name || 'Teammate'}</Text>
            {!!item.text && <Text style={ui.body}>{item.text}</Text>}
            {item.image_id && <AttachmentButton id={item.image_id} label="View chat image" request={request} imageOnly />}
            <Text style={ui.muted}>{timestamp(item.created_at)}</Text>
            {item.sender_id !== account.id && <Button label="Report or block" quiet onPress={() => safety({
              kind: 'message', id: item.id, memberId: item.sender_id, name: item.sender_name,
            })} />}
          </View>
        )} />
      <View style={styles.composer}>
        {account.community_terms_accepted ? (
          <>
            <Field label="Message" value={text} onChangeText={setText} multiline maxLength={4000} />
            <Button label={action.busy ? 'Sending…' : 'Send message'} onPress={send} disabled={action.busy || !text.trim()} />
          </>
        ) : (
          <>
            <PublicLinks workspace={props.workspace} />
            <TermsCheck accepted={accepted} onChange={setAccepted} />
            <Button label="Agree and continue" onPress={() => void action.run(acceptTerms)} disabled={!accepted || action.busy} />
          </>
        )}
        <Problem message={action.error} />
      </View>
    </View>
  );
}

export function Chat(props: ChatProps) {
  const { api, safety } = props;
  const [thread, setThread] = useState<Conversation | null>(null);
  const load = useCallback(() => api<Conversation[]>('/chats'), [api]);
  const chats = useResource(load);
  useForegroundRefresh(chats.reload, 15000);
  const back = useCallback(() => {
    setThread(null);
    void chats.reload(true);
  }, [chats.reload]);

  if (thread) return <Thread {...props} thread={thread} onBack={back} />;
  return (
    <Page refreshing={chats.loading} onRefresh={chats.reload}>
      <Text accessibilityRole="header" style={ui.title}>Chat</Text>
      <Problem message={chats.error} retry={chats.reload} />
      {chats.loading && !chats.data && <Loading />}
      {chats.data?.length === 0 && <Empty label="Your team’s conversations will appear here." />}
      {chats.data?.map(chat => (
        <View key={chat.id} style={ui.card}>
          <Pressable accessibilityRole="button" onPress={() => setThread(chat)} style={styles.chatRow}>
            <View style={styles.chatIcon}><Icon name="chatbubbles-outline" /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={ui.subtitle}>{chat.name}</Text>
              <Text style={ui.muted} numberOfLines={2}>{chat.last_message || chat.description || 'Open conversation'}</Text>
            </View>
            {!!chat.unread_count && <Text accessibilityLabel={`${chat.unread_count} unread messages`} style={ui.badge}>
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </Text>}
          </Pressable>
          <Button label="Report conversation" quiet onPress={() => safety({ kind: 'chat', id: chat.id })} />
        </View>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  chatIcon: {
    backgroundColor: colors.tealLight, borderRadius: 12, width: 42, height: 42,
    justifyContent: 'center', alignItems: 'center',
  },
  thread: { flex: 1, width: '100%', maxWidth: 670, alignSelf: 'center', paddingHorizontal: 12 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  message: {
    alignSelf: 'flex-start', maxWidth: '94%', borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 5,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.tealLight },
  composer: { paddingVertical: 8, gap: 7 },
});
