import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Award, Zap, Plus } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading } from "@/components/States";

const BADGE_COLOR = { Legend: "var(--teal)", "Rising Star": "var(--info)", "Team Player": "var(--warning)", "New Teammate": "var(--text-muted)" };

export default function Achievements() {
  const [board, setBoard] = useState(null);
  const [kudos, setKudos] = useState([]);
  const [show, setShow] = useState(false);

  const load = async () => {
    try {
      const [b, k] = await Promise.all([api.get("/achievements"), api.get("/kudos")]);
      setBoard(b.data); setKudos(k.data);
    } catch (e) { toast.error(apiError(e)); }
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <BackHeader title="Staff Achievements" subtitle="Celebrate your teammates"
        action={<Btn variant="teal" onClick={() => setShow(true)} data-testid="give-kudos-btn"><Zap size={16} /> Give kudos</Btn>} />
      {board === null ? <Loading /> : (
        <>
          <div className="space-y-3 mb-6">
            {board.map((m, i) => (
              <Card key={m.id} className="p-4 flex items-center gap-3" data-testid="leaderboard-row">
                <span className="font-display text-xl w-6 text-center" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                <Avatar initials={m.initials} size={44} teal={i === 0} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{m.name}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full mt-0.5" style={{ background: "var(--brand-tertiary)", color: BADGE_COLOR[m.badge] }}>
                    <Award size={11} /> {m.badge}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl" style={{ color: "var(--teal)" }}>{m.points}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{m.kudos} kudos</p>
                </div>
              </Card>
            ))}
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Recent kudos</h2>
          {kudos.length === 0 ? (
            <Card className="p-6 text-center"><p className="text-sm" style={{ color: "var(--text-muted)" }}>No kudos yet. Be the first to recognize someone!</p></Card>
          ) : (
            <div className="space-y-3">
              {kudos.map((k) => (
                <Card key={k.id} className="p-4" data-testid="kudos-row">
                  <div className="flex items-center gap-2 mb-1.5 text-sm">
                    <Avatar initials={k.from_initials} size={28} />
                    <span className="font-semibold" style={{ color: "var(--brand)" }}>{k.from_name}</span>
                    <Zap size={13} color="var(--teal)" />
                    <span className="font-semibold" style={{ color: "var(--brand)" }}>{k.to_name}</span>
                    <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(k.created_at)}</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--on-surface)" }}>{k.message}</p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {show && <GiveKudos board={board || []} onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </>
  );
}

function GiveKudos({ board, onClose, onDone }) {
  const [toId, setToId] = useState("");
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!toId) return toast.error("Choose a teammate");
    if (!message.trim()) return toast.error("Add a message");
    try { await api.post("/kudos", { to_id: toId, message }); toast.success("Kudos sent!"); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Give kudos" testId="kudos-modal"
      footer={<Btn variant="teal" onClick={submit} className="w-full" data-testid="submit-kudos">Send kudos</Btn>}>
      <Field label="To">
        <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls} style={inputStyle} data-testid="kudos-to">
          <option value="">Select a teammate…</option>
          {board.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Message">
        <textarea className={inputCls} style={inputStyle} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="kudos-message" placeholder="Thanks for covering my shift!" />
      </Field>
    </Modal>
  );
}
