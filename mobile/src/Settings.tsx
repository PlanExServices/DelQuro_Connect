import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { AttachmentButton, type RequestFile } from './Attachment';
import type { RequestApi } from './service';
import type { Member, ReportAction, ReportTarget, ReviewReport } from './types';
import { Button, Empty, Field, Loading, Page, Problem, PublicLinks, Sheet, ui, useAction, useResource } from './ui';
import type { useSession } from './useSession';

const reasons = {
  harassment: 'Harassment or threats',
  private_information: 'Private information',
  inappropriate_content: 'Inappropriate content',
  spam: 'Spam',
  other: 'Other',
};

export function SafetySheet({ target, userId, api, onClose, onBlock }: {
  target: ReportTarget; userId: string; api: RequestApi; onClose: () => void; onBlock: () => void;
}) {
  const [kind, setKind] = useState<ReportTarget['kind'] | null>(null);
  const [chooseBlock, setChooseBlock] = useState(false);
  const [sent, setSent] = useState(false);
  const action = useAction();
  const canBlock = target.memberId && target.memberId !== userId;

  return (
    <Sheet title="Content and safety" onClose={onClose}>
      <Page>
        <View style={ui.card}>
          {sent ? (
            <Text accessibilityLiveRegion="polite" style={ui.status}>Report sent to your workspace administrator.</Text>
          ) : chooseBlock ? (
            <>
              <Text style={ui.body}>Hide content from {target.name || 'this teammate'}? You can unblock them in Settings.</Text>
              <Button label="Block teammate" danger disabled={action.busy} onPress={() => void action.run(async () => {
                await api(`/me/blocked-members/${target.memberId}`, 'PUT');
                onBlock();
              })} />
              <Button label="Back" quiet disabled={action.busy} onPress={() => setChooseBlock(false)} />
            </>
          ) : kind ? (
            <>
              <Text accessibilityRole="header" style={ui.subtitle}>Why are you reporting this {kind === 'member' ? 'teammate' : kind}?</Text>
              {Object.entries(reasons).map(([reason, label]) => <Button key={reason} label={label} quiet disabled={action.busy}
                onPress={() => void action.run(async () => {
                  await api('/reports', 'POST', { kind, target_id: kind === 'member' ? target.memberId : target.id, reason });
                  setSent(true);
                })} />)}
              <Button label="Back" quiet disabled={action.busy} onPress={() => setKind(null)} />
            </>
          ) : (
            <>
              <Button label={`Report ${target.kind}`} quiet onPress={() => setKind(target.kind)} />
              {canBlock && <>
                <Button label="Report teammate" quiet onPress={() => setKind('member')} />
                <Button label="Block teammate" quiet danger onPress={() => setChooseBlock(true)} />
              </>}
            </>
          )}
          <Problem message={action.error} />
        </View>
      </Page>
    </Sheet>
  );
}

function Blocked({ api, onChange }: { api: RequestApi; onChange: () => void }) {
  const load = useCallback(() => api<Member[]>('/me/blocked-members'), [api]);
  const blocked = useResource(load);
  const action = useAction();
  return (
    <>
      {blocked.loading && !blocked.data && <Loading />}
      <Problem message={blocked.error} retry={blocked.reload} />
      {blocked.data?.length === 0 && <Empty label="You haven’t blocked any teammates." />}
      {blocked.data?.map(member => <View key={member.id} style={ui.card}>
        <Text style={ui.subtitle}>{member.name || 'Teammate'}</Text>
        <Button label="Unblock" quiet disabled={action.busy} onPress={() => void action.run(async () => {
          await api(`/me/blocked-members/${member.id}`, 'DELETE');
          await blocked.reload();
          onChange();
        })} />
      </View>)}
      <Problem message={action.error} />
    </>
  );
}

const reviewLabels: Record<ReportAction, string> = {
  remove: 'Remove content', suspend: 'Suspend account', dismiss: 'Dismiss report',
};

function Moderation({ api, request }: { api: RequestApi; request: RequestFile }) {
  const load = useCallback(async () => {
    const [reports, suspended] = await Promise.all([
      api<ReviewReport[]>('/moderation/reports'), api<Member[]>('/moderation/suspended'),
    ]);
    return { reports, suspended };
  }, [api]);
  const queue = useResource(load);
  const action = useAction();
  const [confirmation, setConfirmation] = useState<{ id: string; action: ReportAction } | null>(null);
  return (
    <>
      <Button label="Refresh reports" quiet onPress={() => void queue.reload()} disabled={queue.loading} />
      <Problem message={queue.error} retry={queue.reload} />
      <Problem message={action.error} />
      {queue.loading && !queue.data && <Loading />}
      {queue.data?.reports.length === 0 && <Empty label="No reports waiting for review." />}
      {queue.data?.reports.map(report => (
        <View style={ui.card} key={report.id}>
          <Text style={ui.badge}>{report.kind}</Text>
          <Text style={ui.subtitle}>{reasons[report.reason as keyof typeof reasons] ?? report.reason}</Text>
          {report.subject_name && <Text style={ui.muted}>{report.subject_name}</Text>}
          <Text style={ui.body}>{report.summary || 'Text unavailable. This report may concern an attachment or removed content.'}</Text>
          {report.attachment_available && <AttachmentButton id={report.id.replace(/:/g, '-')} label="Open reported attachment" shareImage
            request={() => request(`/moderation/reports/${encodeURIComponent(report.id)}/attachment`)} />}
          {confirmation?.id === report.id ? (
            <>
              <Text style={ui.body}>{reviewLabels[confirmation.action]}?</Text>
              <Button label="Confirm" danger={confirmation.action !== 'dismiss'} disabled={action.busy}
                onPress={() => void action.run(async () => {
                  await api(`/moderation/reports/${encodeURIComponent(report.id)}`, 'POST', { action: confirmation.action });
                  setConfirmation(null);
                  await queue.reload();
                })} />
              <Button label="Cancel" quiet onPress={() => setConfirmation(null)} disabled={action.busy} />
            </>
          ) : (
            <View style={ui.row}>
              {(['remove', 'suspend', 'dismiss'] as const)
                .filter(key => key === 'dismiss' || (key === 'remove' && report.can_remove) || (key === 'suspend' && report.can_suspend))
                .map(key => <Button key={key} label={reviewLabels[key]} quiet disabled={action.busy}
                  onPress={() => setConfirmation({ id: report.id, action: key })} />)}
            </View>
          )}
        </View>
      ))}
      {!!queue.data?.suspended.length && <Text accessibilityRole="header" style={ui.subtitle}>Suspended accounts</Text>}
      {queue.data?.suspended.map(member => (
        <View style={ui.card} key={member.id}>
          <Text style={ui.body}>{member.name}</Text>
          <Button label="Restore account access" quiet disabled={action.busy} onPress={() => void action.run(async () => {
            await api(`/moderation/suspended/${member.id}`, 'DELETE');
            await queue.reload();
          })} />
        </View>
      ))}
    </>
  );
}

export function Settings({ session, onClose, onBlocksChanged }: {
  session: ReturnType<typeof useSession>; onClose: () => void; onBlocksChanged: () => void;
}) {
  const account = session.account;
  const [page, setPage] = useState<'settings' | 'deletion' | 'blocks' | 'moderation'>('settings');
  const [password, setPassword] = useState('');
  const action = useAction();
  if (!account) return null;

  const titles = { settings: 'Settings', deletion: 'Delete account', blocks: 'Blocked teammates', moderation: 'Moderation' };
  function back() {
    if (action.busy) return;
    if (page === 'settings') onClose();
    else {
      setPage('settings');
      setPassword('');
      action.setError('');
    }
  }

  return (
    <Sheet title={titles[page]} onClose={back}>
      <Page>
        {page === 'settings' && <>
          <View style={ui.card}>
            <Text style={ui.subtitle}>{account.name}</Text>
            <Text style={ui.muted}>{account.email}</Text>
            {account.campus && <Text style={ui.badge}>{account.campus}</Text>}
            <Button label="Sign out" quiet disabled={action.busy} onPress={() => void action.run(session.signOut)} />
            <Button label="Delete account" quiet danger onPress={() => setPage('deletion')} disabled={action.busy} />
          </View>
          {!account.account_deletion_pending && <View style={ui.card}>
            <Button label="Blocked teammates" quiet onPress={() => setPage('blocks')} />
            {account.permissions.manage_roles && <Button label="Moderation queue" quiet onPress={() => setPage('moderation')} />}
          </View>}
          <PublicLinks includeDeletion workspace={session.workspace} />
        </>}
        {page === 'deletion' && <View style={ui.card}>
          <Text style={ui.body}>This permanently removes your account, messages, posts and time-off requests. Confirm with your password.</Text>
          <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
          <Button label={action.busy ? 'Deleting…' : 'Permanently delete my account'} danger
            disabled={!password || action.busy} onPress={() => void action.run(() => session.deleteAccount(password))} />
          <Button label="Cancel" quiet onPress={back} disabled={action.busy} />
        </View>}
        {page === 'blocks' && <Blocked api={session.api} onChange={onBlocksChanged} />}
        {page === 'moderation' && <Moderation api={session.api} request={session.request} />}
        <Problem message={action.error} />
      </Page>
    </Sheet>
  );
}
