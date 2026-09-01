import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Users, User, ChevronRight, MessageSquare } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

export default function Chat() {
  const navigate = useNavigate();
  const [chats, setChats] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/chats"); setChats(data); }
    catch (e) { toast.error(apiError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Chat" subtitle="Team conversations"
        action={<Btn onClick={() => setShowNew(true)} data-testid="new-chat-btn"><Plus size={16} /> New group</Btn>} />

      {chats === null ? <Loading /> : chats.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet" hint="Start a group to chat with your team." />
      ) : (
        <div className="space-y-3">
          {chats.map((c) => (
            <Card key={c.id} onClick={() => navigate(`/chat/${c.id}`)} className="p-4 flex items-center gap-3 cursor-pointer hover:card-shadow-lg transition-shadow" data-testid="chat-row">
              <div className="grid place-items-center rounded-full shrink-0" style={{ width: 46, height: 46, background: "var(--brand-tertiary)" }}>
                {c.is_everyone ? <Users size={20} color="var(--teal)" /> : <User size={20} color="var(--teal)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{c.name}</p>
                <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                  {c.last_message ? `${c.last_sender ? c.last_sender + ": " : ""}${c.last_message}` : (c.description || "No messages yet")}
                </p>
              </div>
              <ChevronRight size={20} color="var(--text-muted)" />
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewChatModal onClose={() => setShowNew(false)} onDone={(id) => { setShowNew(false); load(); if (id) navigate(`/chat/${id}`); }} />}
    </>
  );
}

function NewChatModal({ onClose, onDone }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [members, setMembers] = useState([]);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/team/members").then(({ data }) => setTeam(data)).catch(() => {}); }, []);

  const toggle = (id) => setMembers((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name your group");
    setBusy(true);
    try {
      const { data } = await api.post("/chats", { name, description: desc, is_everyone: everyone, member_ids: everyone ? [] : members });
      toast.success("Group created");
      onDone(data.id);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New group" testId="new-chat-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-chat">{busy ? "Creating…" : "Create group"}</Btn>}>
      <Field label="Group name">
        <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} data-testid="chat-name-input" />
      </Field>
      <Field label="Description / rules (optional)">
        <textarea className={inputCls} style={inputStyle} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="chat-desc-input" />
      </Field>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setEveryone(true)} className="flex-1 py-2.5 rounded-2xl text-sm font-medium" style={{ background: everyone ? "var(--brand)" : "var(--surface-tertiary)", color: everyone ? "#fff" : "var(--brand)" }} data-testid="chat-everyone">Everyone at hospital</button>
        <button onClick={() => setEveryone(false)} className="flex-1 py-2.5 rounded-2xl text-sm font-medium" style={{ background: !everyone ? "var(--brand)" : "var(--surface-tertiary)", color: !everyone ? "#fff" : "var(--brand)" }} data-testid="chat-custom">Custom group</button>
      </div>
      {!everyone && (
        <div className="max-h-56 overflow-y-auto space-y-1.5 mb-2">
          {team.map((m) => (
            <label key={m.id} className="flex items-center gap-3 p-2 rounded-xl cursor-pointer" style={{ background: members.includes(m.id) ? "var(--brand-tertiary)" : "transparent" }}>
              <input type="checkbox" checked={members.includes(m.id)} onChange={() => toggle(m.id)} />
              <Avatar initials={m.initials} size={30} />
              <span className="text-sm" style={{ color: "var(--brand)" }}>{m.name}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
