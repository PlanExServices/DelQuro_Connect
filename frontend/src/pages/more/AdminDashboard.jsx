import { useEffect, useState } from "react";
import { Users, Clock, MessageSquare, Calendar, FileText } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/kit";
import { Loading } from "@/components/States";

const STATS = [
  { key: "total_staff", label: "Total staff", icon: Users },
  { key: "pending_timeoff", label: "Pending time off", icon: Clock },
  { key: "active_chats", label: "Active chats", icon: MessageSquare },
  { key: "schedules", label: "Schedules", icon: Calendar },
  { key: "posts", label: "Posts", icon: FileText },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch((e) => toast.error(apiError(e)));
  }, []);

  return (
    <>
      <BackHeader title="Admin Dashboard" subtitle="Workspace at a glance" />
      {stats === null ? <Loading /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {STATS.map(({ key, label, icon: Icon }) => (
            <Card key={key} className="p-5" data-testid={`stat-${key}`}>
              <div className="grid place-items-center rounded-2xl mb-3" style={{ width: 42, height: 42, background: "var(--brand-tertiary)" }}>
                <Icon size={19} color="var(--teal)" />
              </div>
              <p className="font-display text-4xl" style={{ color: "var(--brand)" }}>{stats[key]}</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
