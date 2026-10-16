import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, FileText, Download, Trash2, Calendar, Eye } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/Modal";
import { ImageViewer } from "@/components/ImageViewer";
import { PdfPreview } from "@/components/PdfPreview";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";

const PERIODS = [
  { key: "current", label: "Current" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All posted" },
];

const shortDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
const dateRange = (schedule) => schedule.effective_start && schedule.effective_end
  ? `${shortDate(schedule.effective_start)} – ${shortDate(schedule.effective_end)}`
  : `Posted ${new Date(schedule.created_at).toLocaleDateString()}`;
const fileKind = (schedule) => (schedule.content_type || "").includes("pdf") ? "pdf"
  : (schedule.content_type || "").startsWith("image/") ? "image" : null;
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const schedulePeriod = (schedule) => {
  if (!schedule.effective_start || !schedule.effective_end) return schedule.period;
  const today = todayIso();
  return today < schedule.effective_start ? "upcoming" : today > schedule.effective_end ? "previous" : "current";
};

export default function Schedule() {
  const { user } = useAuth();
  const [tab, setTab] = useState("current");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [campus, setCampus] = useState("");
  const [department, setDepartment] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Promise.all(PERIODS.map((p) => api.get(`/schedules?period=${p.key}`)));
      setData(Object.fromEntries(PERIODS.map((p, i) => [p.key, res[i].data])));
    } catch (e) { setError(apiError(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (schedule) => {
    if (!window.confirm(`Delete “${schedule.title}”? This removes the uploaded file.`)) return;
    try { await api.delete(`/schedules/${schedule.id}`); toast.success("Schedule removed"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const all = data.all || [];
  const campuses = [...new Set(all.map((s) => s.campus).filter(Boolean))].sort();
  const departments = [...new Set(all.map((s) => s.department).filter(Boolean))].sort();
  const list = (data[tab] || []).filter((s) => (!campus || s.campus === campus) && (!department || s.department === department));
  const preview = (s) => setViewer({ src: fileUrl(s.file_id), title: s.title, kind: fileKind(s) });

  return (
    <>
      <PageHeader title="Schedules" subtitle="Find your current and upcoming team schedules"
        action={user?.permissions?.manage_schedules && <Btn onClick={() => setShowUpload(true)} data-testid="upload-schedule-btn" className="shrink-0 px-3 sm:px-5"><Upload size={16} /> Upload</Btn>} />

      <div className="flex gap-1 mb-4 p-1 rounded-2xl" style={{ background: "var(--surface-tertiary)" }} role="tablist" aria-label="Schedule period">
        {PERIODS.map((p) => <button key={p.key} onClick={() => setTab(p.key)} data-testid={`schedule-tab-${p.key}`} role="tab" aria-selected={tab === p.key}
          className="flex-1 px-2 sm:px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: tab === p.key ? "var(--card)" : "transparent", color: tab === p.key ? "var(--teal-dark)" : "var(--text-secondary)", boxShadow: tab === p.key ? "0 2px 8px rgba(15,58,95,0.08)" : "none" }}>
          {p.label}{data[p.key]?.length ? ` (${data[p.key].length})` : ""}
        </button>)}
      </div>

      {(campuses.length > 1 || departments.length > 1) && <div className="flex gap-2 mb-4">
        {campuses.length > 1 && <select aria-label="Filter by campus" className={inputCls} style={inputStyle} value={campus} onChange={(e) => setCampus(e.target.value)}><option value="">All campuses</option>{campuses.map((name) => <option key={name}>{name}</option>)}</select>}
        {departments.length > 1 && <select aria-label="Filter by department" className={inputCls} style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select>}
      </div>}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : list.length === 0 ? (
        <EmptyState icon={Calendar} title={campus || department ? "No schedules match these filters" : tab === "current" ? "No current schedule" : tab === "upcoming" ? "No upcoming schedules" : "No schedules posted"}
          hint={campus || department ? "Try another campus or department." : user?.permissions?.manage_schedules ? "Use Upload to add a schedule with effective dates." : "Check back for updates from your manager."} />
      ) : <div className="space-y-3">
        {list.map((s) => <Card key={s.id} className="p-4" data-testid="schedule-row">
          <div className="flex items-start gap-3">
            <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 46, height: 46, background: "var(--brand-tertiary)" }}><FileText size={20} color="var(--teal-dark)" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[16px] leading-snug" style={{ color: "var(--brand)" }}>{s.title}</h2>
              <span className="inline-flex rounded-full px-2 py-0.5 mt-1 text-xs font-semibold capitalize" style={{ background: "var(--brand-tertiary)", color: "var(--teal-dark)" }}>{schedulePeriod(s)}</span>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{dateRange(s)}</p>
              {(s.campus || s.department) && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{[s.campus, s.department].filter(Boolean).join(" · ")}</p>}
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{s.file_name} · {fmtBytes(s.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: "var(--divider)" }}>
            {fileKind(s) && <button onClick={() => preview(s)} className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold" style={{ color: "var(--brand)", background: "var(--surface-tertiary)" }} data-testid="schedule-preview"><Eye size={16} /> Preview</button>}
            <a href={fileUrl(s.file_id)} download={s.file_name} className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold" style={{ color: "var(--teal-dark)", background: "var(--brand-tertiary)" }} data-testid="schedule-download"><Download size={16} /> Download</a>
            {user?.permissions?.manage_schedules && <button onClick={() => del(s)} aria-label={`Delete ${s.title}`} className="grid place-items-center rounded-full ml-auto" style={{ width: 40, height: 40, background: "var(--error-soft)" }} data-testid="schedule-delete"><Trash2 size={16} color="var(--error)" /></button>}
          </div>
        </Card>)}
      </div>}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />}
      {viewer?.kind === "pdf" && <Modal open onClose={() => setViewer(null)} title={viewer.title} size="lg" testId="schedule-pdf-preview"
        footer={<a href={viewer.src} download className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--teal-dark)" }}><Download size={16} /> Download PDF</a>}>
        <PdfPreview src={viewer.src} title={viewer.title} />
      </Modal>}
      {viewer?.kind === "image" && <ImageViewer src={viewer.src} onClose={() => setViewer(null)} />}
    </>
  );
}

function UploadModal({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [campus, setCampus] = useState("");
  const [department, setDepartment] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !start || !end || !file) return toast.error("Add a title, effective dates, and file");
    if (end < start) return toast.error("End date must be on or after start date");
    setBusy(true);
    const today = todayIso();
    const period = start > today ? "upcoming" : end < today ? "previous" : "current";
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title.trim()); fd.append("period", period);
    fd.append("effective_start", start); fd.append("effective_end", end);
    fd.append("campus", campus.trim()); fd.append("department", department.trim());
    try { await api.post("/schedules/upload", fd); toast.success("Schedule uploaded"); onDone(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} title="Upload schedule" testId="upload-modal"
    footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-upload">{busy ? "Uploading…" : "Upload schedule"}</Btn>}>
    <Field label="Schedule title"><input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="schedule-title-input" placeholder="Floor and surgery · Week of Oct 12" /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Starts"><input type="date" className={inputCls} style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} data-testid="schedule-start" /></Field>
      <Field label="Ends"><input type="date" className={inputCls} style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} data-testid="schedule-end" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Campus (optional)"><input className={inputCls} style={inputStyle} value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="Main Campus" /></Field>
      <Field label="Department (optional)"><input className={inputCls} style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Surgery" /></Field>
    </div>
    <Field label="PDF or image"><input type="file" accept="application/pdf,image/*" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0])} data-testid="schedule-file-input" /></Field>
    {file && <p className="text-sm mb-3" style={{ color: "var(--teal-dark)" }}>Selected: {file.name}</p>}
  </Modal>;
}
