import { useNavigate } from "react-router-dom";
import { ChevronRight, Grid, Users, Shield, MapPin, UserPlus, FileText, Award } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { PageHeader, Card, RoleChip } from "@/components/kit";

function Tile({ icon: Icon, label, tag, onClick, testId }) {
  return (
    <button onClick={onClick} data-testid={testId} className="text-left">
      <Card className="p-4 h-full hover:card-shadow-lg transition-shadow">
        <div className="grid place-items-center rounded-2xl mb-3" style={{ width: 44, height: 44, background: "var(--brand)" }}>
          <Icon size={20} color="#fff" />
        </div>
        <p className="font-display text-[17px] leading-tight" style={{ color: "var(--brand)" }}>{label}</p>
        {tag && <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "var(--brand-tertiary)", color: "var(--teal)" }}>{tag}</span>}
      </Card>
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>{title}</h2>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export default function More() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const p = user?.permissions || {};

  return (
    <>
      <PageHeader title="More" subtitle="Tools, team and settings" />

      <Card onClick={() => navigate("/profile")} className="p-4 flex items-center gap-3 mb-3 cursor-pointer hover:card-shadow-lg transition-shadow" data-testid="profile-card">
        <Avatar initials={user?.initials} size={52} teal />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl truncate" style={{ color: "var(--brand)" }}>{user?.name}</p>
          <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{user?.email}</p>
        </div>
        <RoleChip role={user?.role} />
        <ChevronRight size={20} color="var(--text-muted)" />
      </Card>
      <p className="text-xs mb-6 ml-1" style={{ color: "var(--text-muted)" }}>Manage your profile, preferences and password</p>

      <Section title="Team">
        {p.admin_dashboard && <Tile icon={Grid} label="Admin Dashboard" tag={user.role === "admin" ? "Admin" : "Manager"} onClick={() => navigate("/more/admin")} testId="tile-admin" />}
        <Tile icon={Users} label="Team Directory" onClick={() => navigate("/more/directory")} testId="tile-directory" />
      </Section>

      {(p.manage_roles || p.manage_locations || p.invite) && (
        <Section title="Administration">
          {p.manage_roles && <Tile icon={Shield} label="Manage Roles" tag="Admin" onClick={() => navigate("/more/roles")} testId="tile-roles" />}
          {p.manage_locations && <Tile icon={MapPin} label="Location Settings" tag="Admin" onClick={() => navigate("/more/location")} testId="tile-location" />}
          {p.invite && <Tile icon={UserPlus} label="My Invitations" tag={user.role === "admin" ? "Admin" : "Manager"} onClick={() => navigate("/more/invitations")} testId="tile-invitations" />}
        </Section>
      )}

      <Section title="Knowledge">
        <Tile icon={FileText} label="Hospital Rules" onClick={() => navigate("/more/knowledge/hospital_rules")} testId="tile-rules" />
        <Tile icon={Award} label="Staff Achievements" onClick={() => navigate("/more/achievements")} testId="tile-achievements" />
      </Section>
    </>
  );
}
