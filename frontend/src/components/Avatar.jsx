export function Avatar({ initials, size = 40, teal = false, className = "" }) {
  return (
    <div
      className={`grid place-items-center rounded-full shrink-0 font-display font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: teal ? "var(--teal)" : "var(--brand-tertiary)",
        color: teal ? "#fff" : "var(--brand)",
      }}
    >
      {initials || "?"}
    </div>
  );
}
