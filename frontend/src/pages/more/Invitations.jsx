import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Copy, Trash2, UserPlus } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Modal } from "@/components/Modal";
import { Card, Btn, Field, inputCls, inputStyle, RoleChip } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

const ROLES = ["staff", "manager", "admin"];
const CHANNELS = ["code", "email", "phone"];

export default function Invitations() {
  const [invites, setInvites] = useState(null);
  const [show, setShow] = useState(false);

  const load = () => api.get("/invites").then(({ data }) => setInvites(data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, []);

  const copy = (inv) => {
    const msg = `You're invited to join Delquro Connect as a ${inv.access}. Use one-time code ${inv.code} to register. Expires in 7 days.`;
    navigator.clipboard?.writeText(msg);
    toast.success("Invite message copied");
  };

  const del = async (id) => {
    try { await api.delete(`/invites/${id}`); toast.success("Invite deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <BackHeader title="My Invitations" subtitle="Invite teammates with one-time codes"
        action={<Btn onClick={() => setShow(true)} data-testid="new-invite-btn"><Plus size={16} /> New</Btn>} />
      {invites === null ? <Loading /> : invites.length === 0 ? (
        <EmptyState icon={UserPlus} title="No invites yet" hint="Create an invite code to add teammates." />
      ) : (
        <div className="space-y-3">
          {invites.map((inv) => (
            <Card key={inv.id} className="p-4 flex items-center gap-3" data-testid="invite-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-xl tracking-wider" style={{ color: "var(--brand)" }}>{inv.code}</p>
                  <RoleChip role={inv.access} />
                  {inv.used && <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: "var(--surface-tertiary)", color: "var(--text-muted)" }}>Used</span>}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{inv.job_title || "No job title"}{inv.campus ? ` · ${inv.campus}` : ""}</p>
              </div>
              <button onClick={() => copy(inv)} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }} data-testid="invite-copy"><Copy size={16} color="var(--brand)" /></button>
              <button onClick={() => del(inv.id)} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "var(--surface-tertiary)" }} data-testid="invite-delete"><Trash2 size={16} color="var(--error)" /></button>
            </Card>
          ))}
        </div>
      )}
      {show && <CreateInvite onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </>
  );
}

function CreateInvite({ onClose, onDone }) {
  const [access, setAccess] = useState("staff");
  const [channel, setChannel] = useState("code");
  const [value, setValue] = useState("");
  const [campus, setCampus] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/invites", { access, channel, value: value || undefined, campus: campus || undefined, job_title: jobTitle || undefined });
      toast.success("Invite created");
      onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Create invite" testId="create-invite-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-invite">{busy ? "Creating…" : "Generate code"}</Btn>}>
      <Field label="Access role">
        <div className="flex gap-2">
          {ROLES.map((r) => (
            <button key={r} onClick={() => setAccess(r)} className="flex-1 py-2 rounded-full text-sm font-medium capitalize" style={{ background: access === r ? "var(--brand)" : "var(--surface-tertiary)", color: access === r ? "#fff" : "var(--brand)" }} data-testid={`invite-access-${r}`}>{r}</button>
          ))}
        </div>
      </Field>
      <Field label="Channel">
        <div className="flex gap-2">
          {CHANNELS.map((c) => (
            <button key={c} onClick={() => setChannel(c)} className="flex-1 py-2 rounded-full text-sm font-medium capitalize" style={{ background: channel === c ? "var(--teal)" : "var(--surface-tertiary)", color: channel === c ? "#fff" : "var(--brand)" }}>{c}</button>
          ))}
        </div>
      </Field>
      {channel !== "code" && (
        <Field label={channel === "email" ? "Email address" : "Phone number"}>
          <input className={inputCls} style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} data-testid="invite-value" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Campus (optional)"><input className={inputCls} style={inputStyle} value={campus} onChange={(e) => setCampus(e.target.value)} /></Field>
        <Field label="Job title (optional)"><input className={inputCls} style={inputStyle} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
