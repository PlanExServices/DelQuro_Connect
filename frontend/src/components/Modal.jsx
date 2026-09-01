import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children, footer, testId, size = "md" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid={testId}>
      <div className="absolute inset-0" style={{ background: "var(--scrim)" }} onClick={onClose} />
      <div className={`relative w-full ${maxW} bg-white rounded-t-3xl sm:rounded-3xl card-shadow-lg animate-fade-up max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="font-display text-xl" style={{ color: "var(--brand)" }}>{title}</h3>
          <button onClick={onClose} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: "var(--surface-tertiary)" }} data-testid="modal-close">
            <X size={18} color="var(--brand)" />
          </button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 shrink-0 border-t" style={{ borderColor: "var(--divider)" }}>{footer}</div>}
      </div>
    </div>
  );
}
