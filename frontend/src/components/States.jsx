import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" data-testid="loading-state">
      <Loader2 className="animate-spin" size={28} color="var(--teal)" />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" data-testid="empty-state">
      <div className="grid place-items-center rounded-2xl mb-1" style={{ width: 56, height: 56, background: "var(--brand-tertiary)" }}>
        <Icon size={26} color="var(--teal)" />
      </div>
      <p className="font-display text-lg" style={{ color: "var(--brand)" }}>{title}</p>
      {hint && <p className="text-sm" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" data-testid="error-state">
      <AlertTriangle size={28} color="var(--error)" />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{message || "Something went wrong."}</p>
      {onRetry && (
        <button onClick={onRetry} data-testid="retry-button" className="text-sm font-medium px-4 py-2 rounded-full" style={{ background: "var(--brand-tertiary)", color: "var(--brand)" }}>
          Try again
        </button>
      )}
    </div>
  );
}
