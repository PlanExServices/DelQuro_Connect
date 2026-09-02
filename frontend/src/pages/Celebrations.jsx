import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Gift, Award } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { BackHeader } from "@/components/BackHeader";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

const CONFIG = {
  birthdays: {
    title: "Upcoming Birthdays",
    subtitle: "Who's celebrating next",
    endpoint: "/team/birthdays",
    icon: Gift,
    right: (x) => (x.days === 0 ? "Today!" : `in ${x.days} day${x.days === 1 ? "" : "s"}`),
  },
  anniversaries: {
    title: "Upcoming Anniversaries",
    subtitle: "Work anniversaries coming up",
    endpoint: "/team/anniversaries",
    icon: Award,
    right: (x) => `${x.label}${x.days === 0 ? " · Today!" : ` · in ${x.days}d`}`,
  },
};

export default function Celebrations() {
  const { type } = useParams();
  const cfg = CONFIG[type] || CONFIG.birthdays;
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    api.get(`${cfg.endpoint}?window=366`)
      .then(({ data }) => setItems(data))
      .catch((e) => { toast.error(apiError(e)); setItems([]); });
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <BackHeader title={cfg.title} subtitle={cfg.subtitle} to="/huddle" />
      {items === null ? <Loading /> : items.length === 0 ? (
        <EmptyState icon={cfg.icon} title="Nothing coming up" hint="Add birthdays and start dates in team profiles to see them here." />
      ) : (
        <div className="space-y-3">
          {items.map((x, i) => (
            <Card key={i} className="p-4 flex items-center gap-3" data-testid="celebration-row">
              <span className="font-display text-lg w-6 text-center" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
              <Avatar initials={x.initials} size={44} teal={i === 0} />
              <p className="flex-1 min-w-0 font-semibold text-[15px] truncate" style={{ color: "var(--brand)" }}>{x.name}</p>
              <span className="text-sm font-medium text-right" style={{ color: "var(--teal)" }}>{cfg.right(x)}</span>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
