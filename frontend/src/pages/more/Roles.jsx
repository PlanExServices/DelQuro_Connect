import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { BackHeader } from "@/components/BackHeader";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/kit";
import { Loading } from "@/components/States";

const ROLES = ["staff", "manager", "admin"];

export default function Roles() {
  const [members, setMembers] = useState(null);

  const load = () => api.get("/team/members").then(({ data }) => setMembers(data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, []);

  const changeRole = async (uid, role) => {
    try { await api.put(`/team/${uid}/role?role=${role}`); toast.success("Role updated"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <BackHeader title="Manage Roles" subtitle="Set what each teammate can do" />
      {members === null ? <Loading /> : (
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.id} className="p-4 flex items-center gap-3" data-testid="role-row">
              <Avatar initials={m.initials} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{m.name}</p>
                <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{m.job_title || "Team member"}</p>
              </div>
              <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--surface-tertiary)" }}>
                {ROLES.map((r) => (
                  <button key={r} onClick={() => changeRole(m.id, r)} data-testid={`set-role-${r}`}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize transition-colors"
                    style={{ background: m.role === r ? "var(--brand)" : "transparent", color: m.role === r ? "#fff" : "var(--text-secondary)" }}>
                    {r}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
