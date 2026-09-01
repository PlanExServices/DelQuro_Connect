import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

export default function HospitalRules() {
  const [rules, setRules] = useState(null);
  useEffect(() => {
    api.get("/knowledge/hospital_rules").then(({ data }) => setRules(data)).catch((e) => toast.error(apiError(e)));
  }, []);

  return (
    <>
      <BackHeader title="Hospital Rules" subtitle="Policies every teammate should know" />
      {rules === null ? <Loading /> : rules.length === 0 ? (
        <EmptyState icon={FileText} title="No rules published" />
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => (
            <Card key={i} className="p-5" data-testid="rule-card">
              <h3 className="font-display text-xl mb-2" style={{ color: "var(--brand)" }}>{r.title}</h3>
              <p className="text-[15px] leading-relaxed" style={{ color: "var(--on-surface)" }}>{r.body}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
