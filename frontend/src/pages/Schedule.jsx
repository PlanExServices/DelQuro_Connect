import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, FileText, Image as ImageIcon, Download, Trash2, Calendar, Maximize2 } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/Modal";
import { ImageViewer } from "@/components/ImageViewer";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

const PERIODS = [
  { key: "current", label: "Current Active" },
  { key: "upcoming", label: "Upcoming" },
  { key: "previous", label: "All Posted" },
];

export default function Schedule() {
  const { user } = useAuth();
  const [tab, setTab] = useState("current");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await Promise.all(PERIODS.map((p) => api.get(`/schedules?period=${p.key}`)));
      const map = {};
      PERIODS.forEach((p, i) => { map[p.key] = res[i].data; });
      setData(map);
    } catch (e) { toast.error(apiError(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    try { await api.delete(`/schedules/${id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const list = data[tab] || [];

  return (
    <>
      <PageHeader
        title="Schedule library"
        subtitle="Master schedule library — every upload is preserved"
        action={user?.permissions?.manage_schedules && (
          <Btn onClick={() => setShowUpload(true)} data-testid="upload-schedule-btn"><Upload size={16} /> Upload</Btn>
        )}
      />

      <div className="flex gap-2 mb-6 p-1 rounded-2xl" style={{ background: "var(--surface-tertiary)" }}>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setTab(p.key)} data-testid={`schedule-tab-${p.key}`}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: tab === p.key ? "var(--card)" : "transparent", color: tab === p.key ? "var(--teal)" : "var(--text-secondary)", boxShadow: tab === p.key ? "0 2px 8px rgba(15,58,95,0.08)" : "none" }}>
            {p.label}{data[p.key]?.length ? ` (${data[p.key].length})` : ""}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : list.length === 0 ? (
        <EmptyState icon={Calendar} title="No schedules here" hint="Uploaded schedules will appear in this tab." />
      ) : (
        <div className="space-y-3">
          {list.map((s) => {
            const isPdf = (s.content_type || "").includes("pdf");
            const isImage = (s.content_type || "").startsWith("image");
            return (
              <Card key={s.id} className="p-4" data-testid="schedule-row">
                {isImage && (
                  <button onClick={() => setViewer(fileUrl(s.file_id))} data-testid="schedule-preview"
                    className="relative block w-full mb-3 rounded-2xl overflow-hidden cursor-zoom-in" style={{ background: "var(--surface-tertiary)" }}>
                    <img src={fileUrl(s.file_id)} alt={s.title} className="w-full max-h-80 object-contain" style={{ minHeight: 120 }} />
                    <span className="absolute top-2 right-2 grid place-items-center rounded-full" style={{ width: 34, height: 34, background: "var(--scrim)" }} data-testid="schedule-enlarge">
                      <Maximize2 size={16} color="#fff" />
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 46, height: 46, background: "var(--brand-tertiary)" }}>
                    {isPdf ? <FileText size={20} color="var(--teal)" /> : <ImageIcon size={20} color="var(--teal)" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{s.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{s.file_name} · {fmtBytes(s.size)}</p>
                  </div>
                  <a href={fileUrl(s.file_id)} target="_blank" rel="noreferrer" className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }} data-testid="schedule-download"><Download size={17} color="var(--brand)" /></a>
                  {user?.permissions?.manage_schedules && (
                    <button onClick={() => del(s.id)} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }} data-testid="schedule-delete"><Trash2 size={16} color="var(--error)" /></button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />}
      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}

function UploadModal({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("current");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Add a title");
    if (!file) return toast.error("Choose a file");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title); fd.append("period", period);
    try { await api.post("/schedules/upload", fd); toast.success("Uploaded"); onDone(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Upload schedule" testId="upload-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-upload">{busy ? "Uploading…" : "Upload"}</Btn>}>
      <Field label="Title">
        <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="schedule-title-input" placeholder="Week of Jun 16" />
      </Field>
      <Field label="Period">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className="px-4 py-2 rounded-full text-sm font-medium" style={{ background: period === p.key ? "var(--brand)" : "var(--surface-tertiary)", color: period === p.key ? "#fff" : "var(--brand)" }}>{p.label}</button>
          ))}
        </div>
      </Field>
      <div className="flex gap-3 mt-2">
        <label className="flex-1 cursor-pointer">
          <div className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium" style={{ background: "var(--surface-tertiary)", color: "var(--brand)" }}><FileText size={18} /> PDF or image</div>
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0])} data-testid="schedule-file-input" />
        </label>
        <label className="flex-1 cursor-pointer">
          <div className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium" style={{ background: "var(--surface-tertiary)", color: "var(--brand)" }}><ImageIcon size={18} /> Take photo</div>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0])} />
        </label>
      </div>
      {file && <p className="text-xs mt-3" style={{ color: "var(--teal)" }}>Selected: {file.name}</p>}
    </Modal>
  );
}
