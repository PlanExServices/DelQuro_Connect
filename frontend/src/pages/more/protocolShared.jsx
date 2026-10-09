import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { Btn, Field, inputCls, inputStyle } from "@/components/kit";

const STATUS = {
  current: { label: "Signed", bg: "rgba(46,125,50,0.12)", color: "var(--success)" },
  needed: { label: "Needs sign-off", bg: "rgba(107,29,47,0.12)", color: "var(--burgundy)" },
  expired: { label: "Review due", bg: "rgba(200,146,40,0.15)", color: "var(--gold)" },
};

export function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.needed;
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.color }} data-testid={`status-${status}`}>
      {s.label}
    </span>
  );
}

export async function downloadSignoffCsv() {
  const res = await api.get("/protocols/export.csv", { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `protocol-signoffs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Create a protocol (with its first version), or edit an existing protocol's
// settings. Text changes on an existing protocol go through PublishVersionModal.
export function ProtocolFormModal({ protocol, onClose, onSaved }) {
  const editing = !!protocol;
  const [categories, setCategories] = useState([]);
  const [titles, setTitles] = useState([]);
  const [title, setTitle] = useState(protocol?.title || "");
  const [category, setCategory] = useState(protocol?.category || "Other");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(protocol?.audience || []);
  const [review, setReview] = useState(protocol?.review_months ? String(protocol.review_months) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/meta/protocol-categories").then(({ data }) => setCategories(data)).catch(() => {});
    api.get("/meta/job-titles").then(({ data }) => setTitles(data.job_titles || [])).catch(() => {});
  }, []);

  const toggle = (t) => setAudience((a) => a.includes(t) ? a.filter((x) => x !== t) : [...a, t]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title, category, audience,
        review_months: review ? Number(review) : null,
        // The API requires a body; settings edits keep the current text.
        body: editing ? protocol.body : body,
      };
      const { data } = editing
        ? await api.put(`/protocols/${protocol.id}`, payload)
        : await api.post("/protocols", payload);
      toast.success(editing ? "Protocol updated" : "Protocol published");
      onSaved(data);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Protocol settings" : "New protocol"} size="lg" testId="protocol-form"
      footer={<div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !title.trim() || (!editing && !body.trim())} data-testid="protocol-save">{editing ? "Save" : "Publish v1"}</Btn>
      </div>}>
      <Field label="Title">
        <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Controlled drug count" data-testid="protocol-title" />
      </Field>
      <Field label="Category">
        <select className={inputCls} style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
          {(categories.length ? categories : [category]).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      {!editing && (
        <Field label="Protocol text" hint="Numbered steps work well. Later changes are published as new versions.">
          <textarea className={inputCls} style={inputStyle} rows={8} value={body} onChange={(e) => setBody(e.target.value)} data-testid="protocol-body" />
        </Field>
      )}
      {/* A div, not <Field>: a <label> wrapping several buttons forwards clicks to the first one. */}
      <div className="mb-4">
        <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--brand)" }}>Who must sign off</span>
        <div className="flex flex-wrap gap-2">
          {titles.map((t) => (
            <button type="button" key={t} onClick={() => toggle(t)} aria-pressed={audience.includes(t)} className="text-sm px-3 py-1.5 rounded-full"
              style={audience.includes(t) ? { background: "var(--teal)", color: "#fff" } : { background: "var(--surface-tertiary)", color: "var(--brand)" }}>
              {t}
            </button>
          ))}
        </div>
        <span className="block text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>Leave all unselected to require every teammate.</span>
      </div>
      <Field label="Re-sign every" hint="Sign-offs expire after this long, e.g. 12 for an annual review. Blank means until the next version.">
        <select className={inputCls} style={inputStyle} value={review} onChange={(e) => setReview(e.target.value)}>
          <option value="">Only when a new version is published</option>
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
        </select>
      </Field>
    </Modal>
  );
}

export function PublishVersionModal({ protocol, onClose, onSaved }) {
  const [body, setBody] = useState(protocol.body || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/protocols/${protocol.id}/versions`, { body, change_note: note });
      toast.success(`Version ${data.current_version} published. Everyone will be asked to sign again.`);
      onSaved(data);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Publish version ${protocol.current_version + 1}`} size="lg" testId="publish-version"
      footer={<div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !body.trim() || !note.trim() || body === protocol.body} data-testid="publish-save">Publish</Btn>
      </div>}>
      <Field label="Protocol text">
        <textarea className={inputCls} style={inputStyle} rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="version-body" />
      </Field>
      <Field label="What changed" hint="Shown to staff when they re-sign, and kept in the audit export.">
        <input className={inputCls} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated cefazolin dose per new guideline" data-testid="version-note" />
      </Field>
    </Modal>
  );
}
