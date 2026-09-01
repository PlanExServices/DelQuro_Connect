import { Activity } from "lucide-react";

export function Logo({ size = 40, showWord = true, stacked = false }) {
  const iconSize = Math.round(size * 0.55);
  return (
    <div className={stacked ? "flex flex-col items-center gap-3" : "flex items-center gap-3"}>
      <div
        className="grid place-items-center rounded-2xl shrink-0"
        style={{
          width: size,
          height: size,
          background: "var(--brand-tertiary)",
          boxShadow: "0 4px 12px rgba(15,58,95,0.08)",
        }}
      >
        <Activity size={iconSize} color="var(--teal)" strokeWidth={2.5} />
      </div>
      {showWord && (
        <div className="leading-none">
          <span className="font-display font-semibold tracking-tight" style={{ fontSize: size * 0.5, color: "var(--brand)" }}>
            Delquro
          </span>
          <span className="font-display font-semibold tracking-tight" style={{ fontSize: size * 0.5, color: "var(--teal)" }}>
            {" "}Connect
          </span>
        </div>
      )}
    </div>
  );
}
