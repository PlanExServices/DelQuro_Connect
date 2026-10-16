import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children, footer, testId, size = "md" }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector("button, input, textarea, select, a[href]")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current?.();
      if (e.key !== "Tab") return;
      const items = [...(dialogRef.current?.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]") || [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const maxW = size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid={testId}>
      <div className="absolute inset-0" aria-hidden="true" style={{ background: "var(--scrim)" }} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative w-full ${maxW} bg-white rounded-t-3xl sm:rounded-3xl card-shadow-lg animate-fade-up max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 id={titleId} className="font-display text-xl" style={{ color: "var(--brand)" }}>{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: "var(--surface-tertiary)" }} data-testid="modal-close">
            <X size={18} color="var(--brand)" />
          </button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 shrink-0 border-t" style={{ borderColor: "var(--divider)" }}>{footer}</div>}
      </div>
    </div>
  );
}
