import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Check, CheckCircle2, Pencil, RotateCcw, Trash2, MapPin } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";

const KINDS = {
  patient: "Hospitalized patient",
  callback: "Pending callback",
  owner_update: "Owner update",
  equipment: "Equipment / facility",
  other: "Other",
};
const PRIORITY = {
  critical: { label: "Critical", bg: "rgba(107,29,47,0.12)", color: "var(--burgundy)" },
  watch: { label: "Watch", bg: "rgba(200,146,40,0.15)", color: "var(--gold)" },
  routine: { label: "Routine", bg: "var(--brand-tertiary)", color: "var(--teal)" },
};
const SHIFTS = ["AM", "PM", "Overnight"];
const SBAR = [
  ["situation", "Situation", "What's happening now?"],
  ["background", "Background", "Relevant history, procedures, meds given"],
  ["assessment", "Assessment", "Current status, vitals, pain score"],
  ["recommendation", "Recommendation", "What the next shift needs to do, and when"],
];

function PriorityChip({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.routine;
  return <span className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full" style={{ background: p.bg, color: p.color }}>{p.label}</span>;
}

export default function Handoffs() {
  const { user } = useAuth();
  const [tab, setTab] = useState("open");
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // {} for new, card for edit
  const [resolving, setResolving] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api.get("/handoffs", { params: { status: tab } });
      setItems(data);
    } catch (e) { setErr(apiError(e)); }
  }, [tab]);

  useEffect(() => { setItems(null); load(); }, [load]);

  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast.success(msg); await load(); } catch (e) { toast.error(apiError(e)); }
  };

  const groups = Object.keys(KINDS)
    .map((k) => [k, (items || []).filter((h) => h.kind === k)])
    .filter(([, list]) => list.length);

  return (
    <>
      <PageHeader
        title="Shift Handoff"
        subtitle="SBAR cards that carry over until someone closes them"
        action={<Btn onClick={() => setEditing({})} data-testid="new-handoff-btn"><Plus size={16} /> New</Btn>}
      />

      <div className="flex gap-2 mb-5">
        {[["open", "Open"], ["resolved", "Resolved (24 h)"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`handoff-tab-${k}`}
            className="text-sm font-semibold px-4 py-2 rounded-full"
            style={tab === k ? { background: "var(--brand)", color: "#fff" } : { background: "var(--surface-tertiary)", color: "var(--brand)" }}>
            {label}
          </button>
        ))}
      </div>

      {err ? <ErrorState message={err} onRetry={load} />
        : items === null ? <Loading />
        : items.length === 0 ? (
          <EmptyState icon={ClipboardList} title={tab === "open" ? "Nothing to hand off" : "Nothing resolved in the last day"}
            hint={tab === "open" ? "Add a card for each patient, callback or issue the next shift should know about." : undefined} />
        ) : (
          groups.map(([kind, list]) => (
            <div key={kind} className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>{KINDS[kind]} · {list.length}</h2>
              <div className="space-y-3">
                {list.map((h) => (
                  <Card key={h.id} className="p-5" data-testid="handoff-card">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg leading-tight" style={{ color: "var(--brand)" }}>{h.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {h.location && <><MapPin size={12} className="inline -mt-0.5 mr-0.5" />{h.location} · </>}
                          {h.shift} shift · {h.author_name} · {relativeTime(h.updated_at || h.created_at)}
                        </p>
                      </div>
                      <PriorityChip priority={h.priority} />
                    </div>
                    <dl className="space-y-2">
                      {SBAR.filter(([k]) => h[k]).map(([k, label]) => (
                        <div key={k} className="grid grid-cols-[22px_1fr] gap-2 text-[15px]">
                          <dt className="font-bold" style={{ color: "var(--teal)" }} title={label}>{label[0]}</dt>
                          <dd className="whitespace-pre-wrap" style={{ color: "var(--on-surface)" }}>{h[k]}</dd>
                        </div>
                      ))}
                    </dl>

                    {h.status === "resolved" ? (
                      <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
                        <CheckCircle2 size={14} className="inline mr-1" color="var(--success)" />
                        Resolved by {h.resolved_by_name} {relativeTime(h.resolved_at)}{h.resolution_note ? `: ${h.resolution_note}` : ""}
                      </p>
                    ) : h.received.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span>Received by</span>
                        {h.received.map((r) => <Avatar key={r.user_id} initials={r.initials} size={22} />)}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {h.status === "open" ? (
                        <>
                          {!h.received_by_me && h.author_id !== user?.id && (
                            <Btn variant="teal" onClick={() => act(() => api.post(`/handoffs/${h.id}/receive`), "Marked as received")} data-testid="receive-handoff-btn"><Check size={16} /> Got it</Btn>
                          )}
                          <Btn variant="outline" onClick={() => setEditing(h)} data-testid="edit-handoff-btn"><Pencil size={15} /> Update</Btn>
                          <Btn variant="ghost" onClick={() => setResolving(h)} data-testid="resolve-handoff-btn"><CheckCircle2 size={16} /> Resolve</Btn>
                        </>
                      ) : (
                        <Btn variant="ghost" onClick={() => act(() => api.post(`/handoffs/${h.id}/reopen`), "Reopened")}><RotateCcw size={15} /> Reopen</Btn>
                      )}
                      {(h.author_id === user?.id || ["manager", "admin"].includes(user?.role)) && (
                        <button className="ml-auto grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }}
                          onClick={() => window.confirm("Delete this handoff card?") && act(() => api.delete(`/handoffs/${h.id}`), "Deleted")} aria-label="Delete">
                          <Trash2 size={16} color="var(--error)" />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}

      {editing && <HandoffForm card={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {resolving && <ResolveModal card={resolving} onClose={() => setResolving(null)} onSaved={() => { setResolving(null); load(); }} />}
    </>
  );
}

function HandoffForm({ card, onClose, onSaved }) {
  const isNew = !card.id;
  const hour = new Date().getHours();
  const [f, setF] = useState({
    kind: card.kind || "patient", priority: card.priority || "routine",
    shift: card.shift || (hour < 12 ? "AM" : hour < 19 ? "PM" : "Overnight"),
    title: card.title || "", location: card.location || "",
    situation: card.situation || "", background: card.background || "",
    assessment: card.assessment || "", recommendation: card.recommendation || "",
    due_at: card.due_at || null,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    const body = { ...f };
    ["location", "background", "assessment", "recommendation"].forEach((k) => { if (!body[k]?.trim()) body[k] = null; });
    try {
      if (isNew) await api.post("/handoffs", body);
      else await api.put(`/handoffs/${card.id}`, body);
      toast.success(isNew ? "Handoff added" : "Handoff updated");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "New handoff" : "Update handoff"} size="lg" testId="handoff-form"
      footer={<div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !f.title.trim() || !f.situation.trim()} data-testid="handoff-save">{isNew ? "Add" : "Save"}</Btn>
      </div>}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Type">
          <select className={inputCls} style={inputStyle} value={f.kind} onChange={set("kind")} data-testid="handoff-kind">
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} style={inputStyle} value={f.priority} onChange={set("priority")} data-testid="handoff-priority">
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="From shift">
          <select className={inputCls} style={inputStyle} value={f.shift} onChange={set("shift")}>
            {SHIFTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label={f.kind === "patient" ? "Patient" : f.kind === "equipment" ? "Item" : "Client / topic"}>
          <input className={inputCls} style={inputStyle} value={f.title} onChange={set("title")} placeholder={f.kind === "patient" ? "Biscuit (Labrador)" : ""} data-testid="handoff-title" />
        </Field>
        <Field label="Where">
          <input className={inputCls} style={inputStyle} value={f.location} onChange={set("location")} placeholder="ICU 2" />
        </Field>
      </div>
      {SBAR.map(([k, label, hint]) => (
        <Field key={k} label={`${label}${k === "situation" ? "" : " (optional)"}`}>
          <textarea className={inputCls} style={inputStyle} rows={2} value={f[k]} onChange={set(k)} placeholder={hint} data-testid={`handoff-${k}`} />
        </Field>
      ))}
    </Modal>
  );
}

function ResolveModal({ card, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/handoffs/${card.id}/resolve`, { note: note.trim() || null });
      toast.success("Handoff resolved");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Resolve: ${card.title}`} size="sm"
      footer={<div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy} data-testid="resolve-save">Resolve</Btn>
      </div>}>
      <Field label="Outcome (optional)" hint="e.g. Discharged 15:30, owner called back">
        <input className={inputCls} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} data-testid="resolve-note" />
      </Field>
    </Modal>
  );
}
