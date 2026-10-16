import { useEffect, useState } from "react";

export function CampusBrand({ campus, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [campus?.logo_url]);
  if (!campus) return null;
  const code = campus.campus_code || "CAMPUS";
  const showLogo = campus.logo_url && !imageFailed;

  return (
    <div className="flex items-center gap-2.5 min-w-0" data-testid="campus-brand">
      <div
        className="shrink-0 grid place-items-center overflow-hidden rounded-xl border bg-white"
        style={{ width: compact ? 66 : 94, height: compact ? 42 : 64, borderColor: "var(--divider)" }}
      >
        {showLogo ? (
          <img src={campus.logo_url} alt={`${campus.name} logo`} onError={() => setImageFailed(true)} className="w-full h-full object-contain p-1" />
        ) : (
          <span className="font-bold tracking-tight" style={{ fontSize: compact ? 13 : 17, color: "var(--brand)" }}>{code.slice(0, 6)}</span>
        )}
      </div>
      <div className="min-w-0 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] leading-tight" style={{ color: "var(--teal-dark)" }}>{code} · Campus</p>
        <p className={`${compact ? "text-xs sm:text-sm truncate" : "text-base break-words"} font-semibold leading-tight`} style={{ color: "var(--brand)" }}>{campus.name}</p>
      </div>
    </div>
  );
}
