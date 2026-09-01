import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { BackHeader } from "@/components/BackHeader";
import { Avatar } from "@/components/Avatar";
import { Card, RoleChip } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";
import { Users } from "lucide-react";

export default function Directory() {
  const [members, setMembers] = useState(null);
  useEffect(() => {
    api.get("/team/members").then(({ data }) => setMembers(data)).catch((e) => toast.error(apiError(e)));
  }, []);

  return (
    <>
      <BackHeader title="Team Directory" subtitle="Everyone at your hospital" />
      {members === null ? <Loading /> : members.length === 0 ? (
        <EmptyState icon={Users} title="No team members yet" />
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.id} className="p-4 flex items-center gap-3" data-testid="directory-row">
              <Avatar initials={m.initials} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{m.name}</p>
                <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{m.job_title || "Team member"}{m.campus ? ` · ${m.campus}` : ""}</p>
              </div>
              <RoleChip role={m.role} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
