import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Heart, MessageCircle, Trash2, Camera, Image as ImageIcon, X, Gift, Award, MessageCircle as MC, Send, Zap, ChevronRight, ShieldCheck, BookOpen, CheckCircle2 } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { ImageViewer } from "@/components/ImageViewer";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";

function MiniCard({ icon: Icon, title, items, empty, render, onClick, testId }) {
  return (
    <Card as={onClick ? "button" : "div"} type={onClick ? "button" : undefined} onClick={onClick} data-testid={testId} className={`p-4 flex-1 min-w-0 text-left ${onClick ? "cursor-pointer hover:card-shadow-lg transition-shadow" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="grid place-items-center rounded-xl" style={{ width: 32, height: 32, background: "var(--brand-tertiary)" }}>
          <Icon size={16} color="var(--teal)" />
        </div>
        <h3 className="font-display text-lg" style={{ color: "var(--brand)" }}>{title}</h3>
        {onClick && <ChevronRight size={16} color="var(--text-muted)" className="ml-auto" />}
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
  const navigate = useNavigate();
  const [posts, setPosts] = useState(null);
  const [err, setErr] = useState(null);
  const [bdays, setBdays] = useState([]);
  const [annis, setAnnis] = useState([]);
  const [spotlight, setSpotlight] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);
  const [protocolFor, setProtocolFor] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [p, b, a, s] = await Promise.all([
        api.get("/posts"),
        api.get("/team/birthdays"),
        api.get("/team/anniversaries"),
        api.get("/kudos/spotlight"),
      ]);
      setPosts(p.data); setBdays(b.data); setAnnis(a.data); setSpotlight(s.data.spotlight);
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

  const acknowledge = async (id) => {
    try {
      const { data } = await api.post(`/posts/${id}/acknowledge`);
      setPosts((current) => current.map((p) => p.id === id ? data : p));
      setProtocolFor(null);
      toast.success("Protocol acknowledged");
    } catch (e) { toast.error(apiError(e)); }
  };

  const activeProtocol = posts?.find((p) => p.is_protocol);
  const feedPosts = posts?.filter((p) => p.id !== activeProtocol?.id) || [];

  return (
    <>
      <PageHeader
        title="Huddle"
        subtitle="Team updates and announcements"
        action={user?.permissions?.post_huddle && (
          <Btn onClick={() => setShowNew(true)} data-testid="new-post-btn" className="shrink-0 px-3 sm:px-5"><Plus size={16} /><span className="hidden sm:inline">New </span>Post</Btn>
        )}
      />

      {activeProtocol && <div className="rounded-3xl p-5 mb-5 animate-fade-up" style={{ background: "linear-gradient(135deg, var(--burgundy) 0%, var(--burgundy-dark) 100%)", boxShadow: "0 4px 20px rgba(107,29,47,0.15)" }} data-testid="pinned-protocol-banner">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 44, height: 44, background: "var(--gold)" }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Current protocol · {activeProtocol.protocol_version} · {new Date(activeProtocol.created_at).toLocaleDateString()}</p>
            <h3 className="font-display text-xl text-white leading-snug mt-1">{activeProtocol.title}</h3>
            <p className="text-sm text-white/85 leading-relaxed mt-1 line-clamp-2">{activeProtocol.content}</p>
            <button onClick={() => setProtocolFor(activeProtocol)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold" style={{ color: "var(--burgundy)" }} data-testid="protocol-open"><BookOpen size={16} /> Read protocol</button>
            {activeProtocol.acknowledged && <span className="inline-flex items-center gap-1 text-xs text-white ml-3"><CheckCircle2 size={14} /> Acknowledged</span>}
          </div>
        </div>
      </div>}

      {err ? <ErrorState message={err} onRetry={load} />
        : posts === null ? <Loading />
        : feedPosts.length === 0 ? <EmptyState icon={MC} title="No team updates yet" hint="New announcements will appear here." />
        : (
          <div className="space-y-4">
            {feedPosts.map((p) => (
              <Card key={p.id} className="p-5 animate-fade-up" data-testid="post-card">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar initials={p.author_initials} size={42} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{p.author_name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(p.created_at)}</p>
                  </div>
                  {p.author_id === user?.id && (
                    <button onClick={() => del(p.id)} aria-label={`Delete ${p.title || "post"}`} className="ml-auto grid place-items-center rounded-full" style={{ width: 40, height: 40, background: "var(--surface-tertiary)" }} data-testid="post-delete">
                      <Trash2 size={16} color="var(--error)" />
                    </button>
                  )}
                </div>
                {p.is_protocol && <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Previous protocol · {p.protocol_version}</p>}
                {p.title && <h3 className="font-display text-xl mb-1" style={{ color: "var(--brand)" }}>{p.title}</h3>}
                {p.content && <p className="text-[15px] whitespace-pre-wrap mb-3" style={{ color: "var(--on-surface)" }}>{p.content}</p>}
                {p.image_id && (
                  <button type="button" onClick={() => setViewer(fileUrl(p.image_id))} aria-label={`Open image attached to ${p.title || "post"}`} className="block w-full mb-3">
                    <img src={fileUrl(p.image_id)} alt="Post attachment" className="rounded-2xl w-full max-h-96 object-cover cursor-zoom-in" />
                  </button>
                )}
                <div className="flex items-center gap-5 pt-1">
                  <button onClick={() => toggleLike(p)} aria-label={`${p.liked ? "Unlike" : "Like"} ${p.title || "post"}, ${p.like_count} likes`} aria-pressed={p.liked} className="flex items-center gap-1.5 text-sm font-medium" data-testid="post-like">
                    <Heart size={19} color={p.liked ? "var(--error)" : "var(--text-muted)"} fill={p.liked ? "var(--error)" : "none"} />
                    <span style={{ color: p.liked ? "var(--error)" : "var(--text-secondary)" }}>{p.like_count}</span>
                  </button>
                  <button onClick={() => setCommentsFor(p)} aria-label={`View comments on ${p.title || "post"}, ${p.comment_count} comments`} className="flex items-center gap-1.5 text-sm font-medium" data-testid="post-comment">
                    <MessageCircle size={19} color="var(--text-muted)" />
                    <span style={{ color: "var(--text-secondary)" }}>{p.comment_count}</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

      {(spotlight || bdays.length > 0 || annis.length > 0) && <section className="mt-7" aria-label="Team celebrations">
        <h2 className="font-display text-xl mb-3" style={{ color: "var(--brand)" }}>Team celebrations</h2>
        {spotlight && <div className="rounded-3xl p-4 mb-3 flex items-center gap-3 card-shadow" style={{ background: "var(--brand)" }} data-testid="kudos-spotlight">
          <Zap size={22} color="var(--teal)" />
          <div className="min-w-0 flex-1"><p className="text-xs text-white/80">Kudos spotlight · this week</p><p className="font-display text-lg text-white truncate">{spotlight.name}</p></div>
          <Avatar initials={spotlight.initials} size={40} teal />
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <MiniCard icon={Gift} title="Birthdays" items={bdays} empty="None soon" testId="birthdays-card" onClick={() => navigate("/celebrations/birthdays")}
            render={(b, i) => <div key={i} className="flex items-center gap-2"><span className="text-sm truncate">{b.name}</span><span className="ml-auto text-xs" style={{ color: "var(--teal-dark)" }}>{b.days === 0 ? "Today" : `${b.days}d`}</span></div>} />
          <MiniCard icon={Award} title="Anniversaries" items={annis} empty="None soon" testId="anniversaries-card" onClick={() => navigate("/celebrations/anniversaries")}
            render={(a, i) => <div key={i} className="flex items-center gap-2"><span className="text-sm truncate">{a.name}</span><span className="ml-auto text-xs" style={{ color: "var(--teal-dark)" }}>{a.label}</span></div>} />
        </div>
      </section>}

      {showNew && <NewPostModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {protocolFor && <Modal open onClose={() => setProtocolFor(null)} title={protocolFor.title} testId="protocol-modal" size="lg"
        footer={protocolFor.acknowledged ? <p className="text-sm font-semibold" style={{ color: "var(--success)" }}>You acknowledged this version.</p> : <Btn onClick={() => acknowledge(protocolFor.id)} className="w-full" data-testid="protocol-ack">Mark as Read &amp; Understood</Btn>}>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>Version {protocolFor.protocol_version} · Posted {new Date(protocolFor.created_at).toLocaleDateString()}</p>
        <p className="text-[15px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--on-surface)" }}>{protocolFor.content}</p>
        {protocolFor.image_id && <img src={fileUrl(protocolFor.image_id)} alt="Protocol attachment" className="mt-4 max-w-full rounded-2xl" />}
      </Modal>}
      {commentsFor && <CommentsModal post={commentsFor} onClose={() => setCommentsFor(null)} onChange={load} />}
      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}

function NewPostModal({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isProtocol, setIsProtocol] = useState(false);
  const [version, setVersion] = useState("");
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
    if (isProtocol && (!title.trim() || !version.trim())) return toast.error("Add a protocol title and version");
    setBusy(true);
    try {
      await api.post("/posts", { title: title || undefined, content, image_id: imageId || undefined, is_protocol: isProtocol, protocol_version: isProtocol ? version : undefined });
      toast.success("Posted!");
      onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Post" testId="new-post-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-post">{busy ? "Posting…" : "Post"}</Btn>}>
      <Field label={isProtocol ? "Protocol title" : "Title (optional)"}>
        <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="post-title-input" />
      </Field>
      <label className="flex items-center gap-3 mb-4 text-sm font-medium" style={{ color: "var(--brand)" }}>
        <input type="checkbox" checked={isProtocol} onChange={(e) => setIsProtocol(e.target.checked)} data-testid="post-protocol-toggle" /> Pin as current protocol
      </label>
      {isProtocol && <Field label="Version" hint="For example, 2026.1 or October 2026">
        <input className={inputCls} style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} data-testid="post-protocol-version" />
      </Field>}
      <Field label="What's happening?">
        <textarea className={inputCls} style={inputStyle} rows={4} value={content} onChange={(e) => setContent(e.target.value)} data-testid="post-content-input" />
      </Field>
      {imageId && (
        <div className="relative mb-4">
          <img src={fileUrl(imageId)} alt="preview" className="rounded-2xl w-full max-h-56 object-cover" />
          <button onClick={() => setImageId(null)} aria-label="Remove image" className="absolute top-2 right-2 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: "var(--scrim)" }}><X size={16} color="#fff" /></button>
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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { const { data } = await api.get(`/posts/${post.id}/comments`); setList(data); }
    catch (e) { setError(apiError(e)); }
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
          <Btn variant="teal" onClick={send} aria-label="Send comment" data-testid="comment-send"><Send size={16} /></Btn>
        </div>
      }>
      {error ? <ErrorState message={error} onRetry={load} /> : list === null ? <Loading /> : list.length === 0 ? (
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
