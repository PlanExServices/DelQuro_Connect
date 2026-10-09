import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, History, Settings, FilePlus2, Archive, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { BackHeader } from "@/components/BackHeader";
import { Card, Btn } from "@/components/kit";
import { Loading, ErrorState } from "@/components/States";
import { ProtocolFormModal, PublishVersionModal, StatusChip } from "@/pages/more/protocolShared";

export default function ProtocolDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const manager = !!user?.permissions?.manage_protocols;
  const [p, setP] = useState(null);
  const [signoffs, setSignoffs] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api.get(`/protocols/${id}`);
      setP(data);
      if (manager) setSignoffs((await api.get(`/protocols/${id}/signoffs`)).data);
    } catch (e) { setErr(apiError(e)); }
  }, [id, manager]);

  useEffect(() => { load(); }, [load]);

  const sign = async () => {
    setBusy(true);
    try {
      await api.post(`/protocols/${id}/acknowledge`, null, { params: { version: p.current_version } });
      toast.success("Signed as read and understood");
      await load();
    } catch (e) {
      toast.error(apiError(e));
      if (e?.response?.status === 409) await load();
    } finally { setBusy(false); }
  };

  const setArchived = async (archived) => {
    try {
      await api.post(`/protocols/${id}/archive`, null, { params: { archived } });
      toast.success(archived ? "Protocol archived" : "Protocol restored");
      await load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (err) return <><BackHeader title="Protocol" /><ErrorState message={err} onRetry={load} /></>;
  if (!p) return <><BackHeader title="Protocol" /><Loading /></>;

  const latestNote = p.versions?.[0];
  const needsSign = p.applies_to_me && !p.archived && p.my_status !== "current";

  return (
    <>
      <BackHeader title={p.title} subtitle={`${p.category} · version ${p.current_version}${p.archived ? " · archived" : ""}`} to="/more/protocols" />

      {p.my_status && !p.archived && (
        <Card className="p-4 mb-4 flex items-center gap-3" data-testid="my-signoff">
          <StatusChip status={p.my_status} />
          <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
            {p.my_status === "current" && `You signed version ${p.current_version} ${relativeTime(p.my_signed_at)}.`}
            {p.my_status === "needed" && p.current_version > 1 && latestNote && `Updated: ${latestNote.change_note}`}
            {p.my_status === "needed" && p.current_version === 1 && "Please read and sign off."}
            {p.my_status === "expired" && `Your sign-off is older than ${p.review_months} months. Please review again.`}
          </p>
        </Card>
      )}

      <Card className="p-5 mb-4">
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--on-surface)" }} data-testid="protocol-text">{p.body}</p>
        {needsSign && (
          <Btn variant="teal" className="mt-5 w-full sm:w-auto" onClick={sign} disabled={busy} data-testid="sign-protocol-btn">
            <CheckCircle2 size={16} /> Read & Understood (sign v{p.current_version})
          </Btn>
        )}
      </Card>

      {manager && (
        <div className="flex flex-wrap gap-2 mb-6">
          {!p.archived && <Btn onClick={() => setModal("version")} data-testid="new-version-btn"><FilePlus2 size={16} /> Publish new version</Btn>}
          <Btn variant="outline" onClick={() => setModal("settings")} data-testid="protocol-settings-btn"><Settings size={16} /> Settings</Btn>
          <Btn variant="ghost" onClick={() => setArchived(!p.archived)} data-testid="archive-protocol-btn"><Archive size={16} /> {p.archived ? "Restore" : "Archive"}</Btn>
        </div>
      )}

      {manager && signoffs && !p.archived && (
        <Card className="p-5 mb-4" data-testid="signoff-roster">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} color="var(--teal)" />
            <h3 className="font-display text-lg" style={{ color: "var(--brand)" }}>Sign-offs for v{signoffs.version}</h3>
            <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>{p.signed_count}/{p.audience_count} current</span>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Audience: {p.audience.length ? p.audience.join(", ") : "everyone"}{p.review_months ? ` · re-sign every ${p.review_months} months` : ""}
          </p>
          {signoffs.members.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nobody on the team has these job titles yet.</p>
          ) : (
            <div className="space-y-2.5">
              {signoffs.members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2.5">
                  <Avatar initials={m.initials} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: "var(--on-surface)" }}>{m.name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{m.job_title || "No job title"}{m.signed_at ? ` · signed ${relativeTime(m.signed_at)}` : ""}</p>
                  </div>
                  <StatusChip status={m.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <History size={18} color="var(--teal)" />
          <h3 className="font-display text-lg" style={{ color: "var(--brand)" }}>Version history</h3>
        </div>
        <div className="space-y-2.5">
          {p.versions.map((v) => (
            <div key={v.version} className="text-sm" data-testid="version-row">
              <span className="font-semibold" style={{ color: "var(--brand)" }}>v{v.version}</span>
              <span style={{ color: "var(--text-secondary)" }}> · {v.change_note}</span>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{v.published_by_name} · {relativeTime(v.published_at)}</span>
            </div>
          ))}
        </div>
      </Card>

      {modal === "version" && <PublishVersionModal protocol={p} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === "settings" && <ProtocolFormModal protocol={p} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}
