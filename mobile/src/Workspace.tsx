import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AttachmentButton, type RequestFile } from './Attachment';
import type { RequestApi } from './service';
import type { CalendarDay, Comment, Post, ReportTarget, Schedule, TimeOffRequest } from './types';
import { Button, colors, dayLabel, Empty, Field, Loading, Page, Problem, timestamp, ui, useAction, useResource } from './ui';

export type WorkspaceProps = {
  api: RequestApi;
  request: RequestFile;
  safety: (target: ReportTarget) => void;
  userId: string;
};

function Comments({ api, id, safety }: { api: RequestApi; id: string; safety: WorkspaceProps['safety'] }) {
  const load = useCallback(() => api<Comment[]>(`/posts/${id}/comments`), [api, id]);
  const comments = useResource(load);
  return (
    <View style={ui.stack}>
      {comments.loading && !comments.data && <Loading />}
      <Problem message={comments.error} retry={comments.reload} />
      {comments.data?.length === 0 && <Text style={ui.muted}>No comments yet.</Text>}
      {comments.data?.map(comment => (
        <View style={styles.comment} key={comment.id}>
          <Text style={ui.label}>{comment.author_name || 'Teammate'}</Text>
          <Text style={ui.body}>{comment.text}</Text>
          <Button label="Report or block" quiet onPress={() => safety({
            kind: 'comment', id: comment.id, memberId: comment.author_id, name: comment.author_name,
          })} />
        </View>
      ))}
    </View>
  );
}

function PostCard({ post, featured, api, request, safety, reload }: WorkspaceProps & {
  post: Post; featured: boolean; reload: () => Promise<void>;
}) {
  const action = useAction();
  const [showComments, setShowComments] = useState(false);
  return (
    <View style={[ui.card, featured && styles.featured]}>
      {post.is_protocol && <Text style={ui.badge}>
        {featured ? 'Current protocol' : 'Protocol'}{post.protocol_version ? ` · ${post.protocol_version}` : ''}
      </Text>}
      {post.title && <Text accessibilityRole="header" style={ui.subtitle}>{post.title}</Text>}
      <Text style={ui.muted}>{[post.author_name, timestamp(post.created_at)].filter(Boolean).join(' · ')}</Text>
      <Text style={ui.body}>{post.content}</Text>
      {post.image_id && <AttachmentButton id={post.image_id} label="View post image" request={request} imageOnly />}
      {post.is_protocol && (post.acknowledged
        ? <Text style={ui.status}>Acknowledged</Text>
        : <Button label="Acknowledge protocol" disabled={action.busy} onPress={() => void action.run(async () => {
          await api(`/posts/${post.id}/acknowledge`, 'POST');
          await reload();
        })} />)}
      <Problem message={action.error} />
      <View style={ui.row}>
        <Button label={showComments ? 'Hide comments' : `Comments (${post.comment_count})`} quiet
          onPress={() => setShowComments(!showComments)} />
        <Button label="Report or block" quiet onPress={() => safety({
          kind: 'post', id: post.id, memberId: post.author_id, name: post.author_name,
        })} />
      </View>
      {showComments && <Comments api={api} id={post.id} safety={safety} />}
    </View>
  );
}

export function Huddle(props: WorkspaceProps) {
  const load = useCallback(() => props.api<Post[]>('/posts'), [props.api]);
  const posts = useResource(load);
  const featured = posts.data?.find(post => post.is_protocol);
  const ordered = featured ? [featured, ...(posts.data ?? []).filter(post => post.id !== featured.id)] : posts.data;
  return (
    <Page refreshing={posts.loading} onRefresh={posts.reload}>
      <Text accessibilityRole="header" style={ui.title}>Huddle</Text>
      <Problem message={posts.error} retry={posts.reload} />
      {posts.loading && !posts.data && <Loading />}
      {ordered?.length === 0 && <Empty label="Your team’s announcements will appear here." />}
      {ordered?.map(post => <PostCard {...props} post={post} key={post.id}
        featured={post.id === featured?.id} reload={posts.reload} />)}
    </Page>
  );
}

const periods = ['current', 'upcoming', 'all'] as const;
const periodLabel = { current: 'Current', upcoming: 'Upcoming', all: 'All posted' };

export function Schedules({ api, request, safety }: WorkspaceProps) {
  const [period, setPeriod] = useState<typeof periods[number]>('current');
  const load = useCallback(() => api<Schedule[]>(`/schedules?period=${period}`), [api, period]);
  const schedules = useResource(load);
  return (
    <Page refreshing={schedules.loading} onRefresh={schedules.reload}>
      <Text accessibilityRole="header" style={ui.title}>Schedule</Text>
      <View style={ui.row}>
        {periods.map(key => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: key === period }}
          onPress={() => setPeriod(key)} style={[styles.period, key === period && styles.selected]}>
          <Text style={ui.label}>{periodLabel[key]}</Text>
        </Pressable>)}
      </View>
      <Problem message={schedules.error} retry={schedules.reload} />
      {schedules.loading && !schedules.data && <Loading />}
      {schedules.data?.length === 0 && <Empty label="No schedules in this view." />}
      {schedules.data?.map(item => (
        <View key={item.id} style={ui.card}>
          <Text accessibilityRole="header" style={ui.subtitle}>{item.title || item.file_name || 'Team schedule'}</Text>
          {!!(item.campus || item.department) &&
            <Text style={ui.badge}>{[item.campus, item.department].filter(Boolean).join(' · ')}</Text>}
          {!!item.effective_start && <Text style={ui.muted}>
            {dayLabel(item.effective_start)}{item.effective_end ? ` – ${dayLabel(item.effective_end)}` : ''}
          </Text>}
          {item.file_id && <AttachmentButton id={item.file_id} request={request} filename={item.file_name} label="Open schedule file" />}
          <Button label="Report schedule" onPress={() => safety({ kind: 'schedule', id: item.id })} quiet />
        </View>
      ))}
    </Page>
  );
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function Calendar({ days, month, selected, onSelect }: {
  days: CalendarDay[]; month: Date; selected: string; onSelect: (date: string) => void;
}) {
  const slots: (CalendarDay | null)[] = [
    ...Array<null>(month.getDay()).fill(null), ...days,
  ];
  while (slots.length % 7) slots.push(null);
  const weeks = Array.from({ length: slots.length / 7 }, (_, index) => slots.slice(index * 7, index * 7 + 7));
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.week}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day =>
          <Text key={day} accessible={false} style={styles.weekday}>{day}</Text>)}
      </View>
      {weeks.map((week, index) => (
        <View key={index} style={styles.week}>
          {week.map((day, column) => day ? (
            <Pressable key={day.date} accessibilityRole="button" accessibilityState={{ selected: day.date === selected }}
              accessibilityLabel={`${dayLabel(day.date)}, ${day.approved} of ${day.limit} approved, ${day.pending} pending`}
              style={[styles.day, day.date === selected && styles.selected]} onPress={() => onSelect(day.date)}>
              <Text style={ui.label}>{Number(day.date.slice(-2))}</Text>
              <Text style={styles.capacity}>{day.limit === 0 ? 'Closed' : `${day.approved}/${day.limit}`}</Text>
            </Pressable>
          ) : <View key={column} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

export function TimeOff({ api }: { api: RequestApi }) {
  const today = localDate(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const action = useAction();
  const load = useCallback(async () => {
    const query = `year=${month.getFullYear()}&month=${month.getMonth() + 1}`;
    const [capacity, requests] = await Promise.all([
      api<{ days: CalendarDay[] }>(`/daylimit/month?${query}`),
      api<TimeOffRequest[]>(`/timeoff/month?${query}`),
    ]);
    return { days: capacity.days, requests, monthKey: localDate(month) };
  }, [api, month]);
  const calendar = useResource(load);
  const data = calendar.data?.monthKey === localDate(month) ? calendar.data : null;
  const day = data?.days.find(item => item.date === selected);
  const own = data?.requests.filter(item => item.date === selected) ?? [];
  const activeRequest = own.some(item => item.status === 'approved' || item.status === 'pending');

  function select(date: string) {
    setSelected(date);
    setReason('');
    setConfirmation('');
    action.setError('');
  }
  function move(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    select(localDate(next));
  }

  return (
    <Page refreshing={calendar.loading} onRefresh={calendar.reload}>
      <Text accessibilityRole="header" style={ui.title}>Time Off</Text>
      <View style={ui.card}>
        <Text accessibilityRole="header" style={ui.subtitle}>
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <View style={ui.row}>
          <Button label="Previous" accessibilityLabel="Previous month" onPress={() => move(-1)} quiet />
          <Button label="Today" onPress={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            select(today);
          }} quiet />
          <Button label="Next" accessibilityLabel="Next month" onPress={() => move(1)} quiet />
        </View>
        {calendar.loading && !data && <Loading />}
        {data && <Calendar days={data.days} month={month} selected={selected} onSelect={select} />}
      </View>
      <Problem message={calendar.error} retry={calendar.reload} />
      {day && (
        <View style={ui.card}>
          <Text accessibilityRole="header" style={ui.subtitle}>{dayLabel(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          <Text style={ui.muted}>{day.limit === 0 ? 'Closed' : day.remaining === 0 ? 'Full' : `${day.remaining} available`}
            {` · ${day.approved} approved · ${day.pending} pending`}
          </Text>
          {own.map(item => (
            <View key={item.id} style={styles.comment}>
              <Text style={ui.label}>{item.status[0].toUpperCase() + item.status.slice(1)}</Text>
              {item.reason && <Text style={ui.body}>{item.reason}</Text>}
              {item.status === 'pending' && <Button label="Cancel request" quiet disabled={action.busy}
                onPress={() => void action.run(async () => {
                  await api(`/timeoff/${item.id}`, 'DELETE');
                  setConfirmation('Request cancelled.');
                  await calendar.reload();
                })} />}
            </View>
          ))}
          {!activeRequest && day.date >= today && <>
            {day.remaining === 0 && <Text style={ui.muted}>Your manager will review requests for this day.</Text>}
            <Field label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={500} multiline />
            <Button label="Request full day" disabled={action.busy} onPress={() => void action.run(async () => {
              await api('/timeoff', 'POST', { date: day.date, reason: reason.trim() || undefined });
              setReason('');
              setConfirmation('Request sent.');
              await calendar.reload();
            })} />
          </>}
          <Problem message={action.error} />
          {!!confirmation && <Text accessibilityLiveRegion="polite" style={ui.status}>{confirmation}</Text>}
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  featured: { borderColor: colors.teal, borderTopWidth: 4 },
  comment: { padding: 12, backgroundColor: colors.page, borderRadius: 12, gap: 6 },
  period: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 11, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.card,
  },
  selected: { backgroundColor: colors.tealLight, borderColor: colors.teal },
  week: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' },
  day: {
    flex: 1, minHeight: 47, alignItems: 'center', justifyContent: 'center', paddingVertical: 4,
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.page,
  },
  capacity: { fontSize: 10, color: colors.muted },
});
