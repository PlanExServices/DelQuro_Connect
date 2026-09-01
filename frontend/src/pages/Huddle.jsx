import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Heart, MessageCircle, Trash2, Camera, Image as ImageIcon, X, Gift, Award, MessageCircle as MC, Send } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { ImageViewer } from "@/components/ImageViewer";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";

function MiniCard({ icon: Icon, title, items, empty, render }) {
  return (
    <Card className="p-4 flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid place-items-center rounded-xl" style={{ width: 32, height: 32, background: "var(--brand-tertiary)" }}>
          <Icon size={16} color="var(--teal)" />
        </div>
        <h3 className="font-display text-lg" style={{ color: "var(--brand)" }}>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{empty}</p>
      ) : (
        <div className="space-y-2.5">{items.slice(0, 3).map(render)}</div>
      )}
    </Card>
  );
}

export default function Huddle() {
  const { user } = useAuth();
  const [posts, setPosts] = useState(null);
  const [err, setErr] = useState(null);
  const [bdays, setBdays] = useState([]);
  const [annis, setAnnis] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [p, b, a] = await Promise.all([
        api.get("/posts"),
        api.get("/team/birthdays"),
        api.get("/team/anniversaries"),
      ]);
      setPosts(p.data); setBdays(b.data); setAnnis(a.data);
    } catch (e) { setErr(apiError(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async (post) => {
    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      setPosts((ps) => ps.map((p) => p.id === post.id ? { ...p, liked: data.liked, like_count: data.like_count } : p));
    } catch (e) { toast.error(apiError(e)); }
  };

  const del = async (id) => {
    try {
      await api.delete(`/posts/${id}`);
      setPosts((ps) => ps.filter((p) => p.id !== id));
      toast.success("Post deleted");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <PageHeader
        title="Huddle"
        subtitle="Team updates and announcements"
        action={user?.permissions?.post_huddle && (
          <Btn onClick={() => setShowNew(true)} data-testid="new-post-btn"><Plus size={16} /> New Post</Btn>
        )}
      />

      <div className="flex gap-4 mb-6">
        <MiniCard icon={Gift} title="Birthdays" items={bdays} empty="None in the next 4 weeks"
          render={(b, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Avatar initials={b.initials} size={30} />
              <span className="text-sm truncate" style={{ color: "var(--on-surface)" }}>{b.name}</span>
              <span className="ml-auto text-xs font-medium" style={{ color: "var(--teal)" }}>{b.days === 0 ? "Today" : `${b.days}d`}</span>
            </div>
          )} />
        <MiniCard icon={Award} title="Anniversaries" items={annis} empty="None in the next 4 weeks"
          render={(a, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Avatar initials={a.initials} size={30} />
              <span className="text-sm truncate" style={{ color: "var(--on-surface)" }}>{a.name}</span>
              <span className="ml-auto text-xs font-medium" style={{ color: "var(--teal)" }}>{a.label}</span>
            </div>
          )} />
      </div>

      {err ? <ErrorState message={err} onRetry={load} />
        : posts === null ? <Loading />
        : posts.length === 0 ? <EmptyState icon={MC} title="No posts yet" hint="Team announcements will show up here." />
        : (
          <div className="space-y-4">
            {posts.map((p) => (
              <Card key={p.id} className="p-5 animate-fade-up" data-testid="post-card">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar initials={p.author_initials} size={42} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{p.author_name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(p.created_at)}</p>
                  </div>
                  {p.author_id === user?.id && (
                    <button onClick={() => del(p.id)} className="ml-auto grid place-items-center rounded-full" style={{ width: 34, height: 34, background: "var(--surface-tertiary)" }} data-testid="post-delete">
                      <Trash2 size={16} color="var(--error)" />
                    </button>
                  )}
                </div>
                {p.title && <h3 className="font-display text-xl mb-1" style={{ color: "var(--brand)" }}>{p.title}</h3>}
                {p.content && <p className="text-[15px] whitespace-pre-wrap mb-3" style={{ color: "var(--on-surface)" }}>{p.content}</p>}
                {p.image_id && (
                  <img src={fileUrl(p.image_id)} alt="post" onClick={() => setViewer(fileUrl(p.image_id))}
                    className="rounded-2xl w-full max-h-96 object-cover cursor-zoom-in mb-3" />
                )}
                <div className="flex items-center gap-5 pt-1">
                  <button onClick={() => toggleLike(p)} className="flex items-center gap-1.5 text-sm font-medium" data-testid="post-like">
                    <Heart size={19} color={p.liked ? "var(--error)" : "var(--text-muted)"} fill={p.liked ? "var(--error)" : "none"} />
                    <span style={{ color: p.liked ? "var(--error)" : "var(--text-secondary)" }}>{p.like_count}</span>
                  </button>
                  <button onClick={() => setCommentsFor(p)} className="flex items-center gap-1.5 text-sm font-medium" data-testid="post-comment">
                    <MessageCircle size={19} color="var(--text-muted)" />
                    <span style={{ color: "var(--text-secondary)" }}>{p.comment_count}</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

      {showNew && <NewPostModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {commentsFor && <CommentsModal post={commentsFor} onClose={() => setCommentsFor(null)} onChange={load} />}
      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}

function NewPostModal({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageId, setImageId] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd);
      setImageId(data.id);
    } catch (er) { toast.error(apiError(er)); }
  };

  const submit = async () => {
    if (!content.trim()) return toast.error("Write something first");
    setBusy(true);
    try {
      await api.post("/posts", { title: title || undefined, content, image_id: imageId || undefined });
      toast.success("Posted!");
      onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Post" testId="new-post-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-post">{busy ? "Posting…" : "Post"}</Btn>}>
      <Field label="Title (optional)">
        <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="post-title-input" />
      </Field>
      <Field label="What's happening?">
        <textarea className={inputCls} style={inputStyle} rows={4} value={content} onChange={(e) => setContent(e.target.value)} data-testid="post-content-input" />
      </Field>
      {imageId && (
        <div className="relative mb-4">
          <img src={fileUrl(imageId)} alt="preview" className="rounded-2xl w-full max-h-56 object-cover" />
          <button onClick={() => setImageId(null)} className="absolute top-2 right-2 grid place-items-center rounded-full" style={{ width: 32, height: 32, background: "var(--scrim)" }}><X size={16} color="#fff" /></button>
        </div>
      )}
      <div className="flex gap-3 mb-2">
        <label className="flex-1 cursor-pointer">
          <div className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium" style={{ background: "var(--surface-tertiary)", color: "var(--brand)" }}>
            <Camera size={18} /> Camera
          </div>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        </label>
        <label className="flex-1 cursor-pointer">
          <div className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium" style={{ background: "var(--surface-tertiary)", color: "var(--brand)" }}>
            <ImageIcon size={18} /> Photo
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={pick} data-testid="post-image-input" />
        </label>
      </div>
    </Modal>
  );
}

function CommentsModal({ post, onClose, onChange }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/posts/${post.id}/comments`); setList(data); }
    catch (e) { toast.error(apiError(e)); }
  }, [post.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await api.post(`/posts/${post.id}/comments`, { text });
      setText(""); load(); onChange?.();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <Modal open onClose={onClose} title="Comments" testId="comments-modal"
      footer={
        <div className="flex gap-2">
          <input className={inputCls} style={inputStyle} placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="comment-input" />
          <Btn variant="teal" onClick={send} data-testid="comment-send"><Send size={16} /></Btn>
        </div>
      }>
      {list === null ? <Loading /> : list.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-4 py-2">
          {list.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar initials={c.author_initials} size={34} />
              <div>
                <p className="text-sm"><span className="font-semibold" style={{ color: "var(--brand)" }}>{c.author_name}</span> <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(c.created_at)}</span></p>
                <p className="text-sm" style={{ color: "var(--on-surface)" }}>{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
