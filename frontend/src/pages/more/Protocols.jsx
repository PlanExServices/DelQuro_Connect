import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Plus, Download, ChevronRight } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { BackHeader } from "@/components/BackHeader";
import { Card, Btn } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";
import { ProtocolFormModal, StatusChip, downloadSignoffCsv } from "@/pages/more/protocolShared";

export default function Protocols() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const manager = !!user?.permissions?.manage_protocols;
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("todo");
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api.get("/protocols", { params: manager && showArchived ? { include_archived: true } : {} });
      setItems(data);
    } catch (e) { setErr(apiError(e)); }
  }, [manager, showArchived]);

  useEffect(() => { load(); }, [load]);

  const mine = (items || []).filter((p) => p.applies_to_me && !p.archived);
  const todo = mine.filter((p) => p.my_status !== "current");
  const shown = filter === "todo" ? todo : (items || []);

  const exportCsv = async () => {
    try { await downloadSignoffCsv(); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <BackHeader
        title="Protocols & SOPs"
        subtitle="Read, sign off and stay current"
        action={manager && <Btn onClick={() => setShowNew(true)} data-testid="new-protocol-btn"><Plus size={16} /> New</Btn>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[["todo", `To sign (${todo.length})`], ["all", "All protocols"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`protocol-filter-${k}`}
            className="text-sm font-semibold px-4 py-2 rounded-full"
            style={filter === k ? { background: "var(--brand)", color: "#fff" } : { background: "var(--surface-tertiary)", color: "var(--brand)" }}>
            {label}
          </button>
        ))}
        {manager && filter === "all" && (
          <label className="text-sm flex items-center gap-2 ml-1" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        )}
        {manager && (
          <Btn variant="outline" className="ml-auto" onClick={exportCsv} data-testid="export-signoffs-btn"><Download size={16} /> Export sign-offs</Btn>
        )}
      </div>

      {err ? <ErrorState message={err} onRetry={load} />
        : items === null ? <Loading />
        : shown.length === 0 ? (
          <EmptyState icon={ShieldCheck}
            title={filter === "todo" ? "You're all signed off" : "No protocols yet"}
            hint={filter === "todo" ? "New and updated protocols will show up here." : manager ? "Add your first SOP with New." : "Your manager hasn't published any protocols yet."} />
        ) : (
          <div className="space-y-3">
            {shown.map((p) => (
              <Card key={p.id} onClick={() => navigate(`/more/protocols/${p.id}`)} data-testid="protocol-card"
                className={`p-4 flex items-center gap-3 cursor-pointer hover:card-shadow-lg transition-shadow ${p.archived ? "opacity-60" : ""}`}>
                <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 44, height: 44, background: "var(--brand-tertiary)" }}>
                  <ShieldCheck size={20} color="var(--teal)" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] leading-tight truncate" style={{ color: "var(--brand)" }}>{p.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {p.category} · v{p.current_version} · updated {relativeTime(p.updated_at)}
                    {manager && !p.archived && ` · ${p.signed_count}/${p.audience_count} signed`}
                    {p.archived && " · archived"}
                  </p>
                </div>
                {p.my_status && !p.archived && <StatusChip status={p.my_status} />}
                <ChevronRight size={18} color="var(--text-muted)" />
              </Card>
            ))}
          </div>
        )}

      {showNew && (
        <ProtocolFormModal onClose={() => setShowNew(false)} onSaved={(p) => { setShowNew(false); navigate(`/more/protocols/${p.id}`); }} />
      )}
    </>
  );
}
