import { forwardRef } from "react";

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-4 mb-6 animate-fade-up">
    <div>
      <h1 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--brand)" }}>{title}</h1>
      {subtitle && <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Card = ({ children, className = "", ...rest }) => (
  <div className={`bg-white rounded-3xl card-shadow ${className}`} {...rest}>{children}</div>
);

export const Btn = forwardRef(({ variant = "primary", className = "", children, ...rest }, ref) => {
  const styles = {
    primary: { background: "var(--brand)", color: "#fff" },
    teal: { background: "var(--teal)", color: "#fff" },
    ghost: { background: "var(--surface-tertiary)", color: "var(--brand)" },
    outline: { background: "transparent", color: "var(--brand)", border: "1.5px solid var(--border-c)" },
    danger: { background: "var(--error)", color: "#fff" },
  }[variant];
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={styles}
      {...rest}
    >
      {children}
    </button>
  );
});

export const Field = ({ label, hint, children }) => (
  <label className="block mb-4">
    {label && <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--brand)" }}>{label}</span>}
    {children}
    {hint && <span className="block text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>{hint}</span>}
  </label>
);

export const inputCls = "w-full rounded-2xl px-4 py-3 text-[15px] outline-none transition-shadow duration-150 focus:ring-2";
export const inputStyle = { background: "var(--input-bg)", border: "1.5px solid var(--border-c)", color: "var(--on-surface)" };

export const RoleChip = ({ role }) => {
  const map = { admin: "var(--teal)", manager: "var(--info)", staff: "var(--text-muted)" };
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full" style={{ background: "var(--brand-tertiary)", color: map[role] || "var(--text-muted)" }}>
      {role}
    </span>
  );
};
