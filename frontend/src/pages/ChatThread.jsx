import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Send, Camera, Image as ImageIcon, X } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { ImageViewer } from "@/components/ImageViewer";
import { inputCls, inputStyle } from "@/components/kit";
import { Loading } from "@/components/States";

export default function ChatThread() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(null);
  const [viewer, setViewer] = useState(null);
  const endRef = useRef(null);

  const loadChat = useCallback(async () => {
    try {
      const { data } = await api.get("/chats");
      setChat(data.find((c) => c.id === id) || { name: "Chat" });
    } catch { /* ignore */ }
  }, [id]);

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get(`/chats/${id}/messages`);
      setMsgs(data);
      api.post(`/chats/${id}/read`).catch(() => {});
    } catch (e) {
      if (e.response?.status === 403) { toast.error("You don't have access to this chat"); navigate("/chat"); }
    }
  }, [id, navigate]);

  useEffect(() => { loadChat(); }, [loadChat]);
  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs?.length]);

  const send = async (imageId) => {
    const body = imageId ? { image_id: imageId } : { text: text.trim() };
    if (!imageId && !body.text) return;
    setText("");
    try { await api.post(`/chats/${id}/messages`, body); poll(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setPending("uploading");
    try {
      const { data } = await api.post("/upload", fd);
      await send(data.id);
    } catch (er) { toast.error(apiError(er)); } finally { setPending(null); }
  };

  const myLastReadId = (() => {
    if (!msgs) return null;
    const mine = msgs.filter((m) => m.sender_id === user?.id);
    const last = mine[mine.length - 1];
    if (last && (last.read_by || []).some((r) => r !== user?.id)) return last.id;
    return null;
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-3 pb-4 mb-2 border-b" style={{ borderColor: "var(--divider)" }}>
        <button onClick={() => navigate("/chat")} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }} data-testid="chat-back"><ArrowLeft size={18} color="var(--brand)" /></button>
        <h1 className="font-display text-2xl" style={{ color: "var(--brand)" }}>{chat?.name || "Chat"}</h1>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {msgs === null ? <Loading /> : msgs.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>No messages yet. Say hello!</p>
        ) : msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`} data-testid="chat-message">
              {!mine && <Avatar initials={m.sender_initials} size={32} />}
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <span className="text-xs font-semibold mb-1 ml-1" style={{ color: "var(--teal)" }}>{m.sender_name}</span>}
                {m.image_id ? (
                  <img src={fileUrl(m.image_id)} alt="attachment" onClick={() => setViewer(fileUrl(m.image_id))}
                    className="rounded-2xl max-w-full max-h-64 object-cover cursor-zoom-in" />
                ) : (
                  <div className="px-4 py-2.5 rounded-2xl text-[15px]" style={{ background: mine ? "var(--brand)" : "var(--card)", color: mine ? "#fff" : "var(--on-surface)", borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6 }}>
                    {m.text}
                  </div>
                )}
                <span className="text-[10px] mt-1 mx-1" style={{ color: "var(--text-muted)" }}>{relativeTime(m.created_at)}</span>
                {myLastReadId === m.id && <span className="text-[11px] font-medium mr-1" style={{ color: "var(--teal)" }}>Seen</span>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 pt-3 mt-2 border-t" style={{ borderColor: "var(--divider)" }}>
        <label className="grid place-items-center rounded-full cursor-pointer shrink-0" style={{ width: 40, height: 40, background: "var(--surface-tertiary)" }}>
          <Camera size={18} color="var(--brand)" />
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pickImage} />
        </label>
        <label className="grid place-items-center rounded-full cursor-pointer shrink-0" style={{ width: 40, height: 40, background: "var(--surface-tertiary)" }} data-testid="chat-gallery">
          <ImageIcon size={18} color="var(--brand)" />
          <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
        </label>
        <input className={inputCls} style={inputStyle} placeholder={pending ? "Uploading…" : "Message…"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="chat-input" />
        <button onClick={() => send()} className="grid place-items-center rounded-full shrink-0" style={{ width: 44, height: 44, background: "var(--teal)" }} data-testid="chat-send"><Send size={18} color="#fff" /></button>
      </div>

      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
