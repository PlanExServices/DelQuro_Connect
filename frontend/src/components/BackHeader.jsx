import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function BackHeader({ title, subtitle, to = -1, action }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 mb-6 animate-fade-up">
      <button onClick={() => navigate(to)} className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: "var(--card)" }} data-testid="back-header">
        <ArrowLeft size={18} color="var(--brand)" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl sm:text-3xl leading-tight truncate" style={{ color: "var(--brand)" }}>{title}</h1>
        {subtitle && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
