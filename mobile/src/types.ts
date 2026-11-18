export type Account = {
  id: string;
  name: string;
  email: string;
  campus: string | null;
  role: string;
  community_terms_accepted: boolean;
  account_deletion_pending: boolean;
  permissions: { manage_roles: boolean };
};

export type Session = { access_token: string; refresh_token: string; user: Account };

export type Member = { id: string; name: string };
export type ReportKind = 'post' | 'comment' | 'message' | 'member' | 'chat' | 'schedule';
export type ReportTarget = { kind: ReportKind; id: string; memberId?: string | null; name?: string | null };
export type ReportAction = 'dismiss' | 'remove' | 'suspend';
export type ReviewReport = {
  id: string;
  kind: ReportKind;
  reason: string;
  summary: string;
  subject_name: string | null;
  can_suspend: boolean;
  can_remove: boolean;
  attachment_available: boolean;
};

export type Post = {
  id: string;
  title: string | null;
  content: string;
  author_id: string | null;
  author_name: string | null;
  image_id: string | null;
  is_protocol: boolean;
  protocol_version: string | null;
  acknowledged: boolean;
  comment_count: number;
  created_at: string;
};

export type Comment = {
  id: string; text: string; author_id: string | null; author_name: string | null;
};

export type CalendarDay = {
  date: string; limit: number; approved: number; pending: number; remaining: number;
};
export type TimeOffRequest = {
  id: string; date: string; reason: string | null; status: 'pending' | 'approved' | 'declined';
};

export type Schedule = {
  id: string;
  title: string | null;
  file_id: string | null;
  file_name: string | null;
  effective_start: string | null;
  effective_end: string | null;
  campus: string | null;
  department: string | null;
};

export type Conversation = {
  id: string; name: string; description: string | null; last_message: string | null; unread_count: number;
};

export type Message = {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  text: string | null;
  image_id: string | null;
  created_at: string;
  read_by: string[];
};
