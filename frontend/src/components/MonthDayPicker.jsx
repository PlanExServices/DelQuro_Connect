import { inputCls, inputStyle } from "@/components/kit";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function MonthDayPicker({ value, onChange, testId }) {
  const parts = (value || "").split("-");
  const mm = parts.length === 2 ? parts[0] : parts.length === 3 ? parts[1] : "";
  const dd = parts.length === 2 ? parts[1] : parts.length === 3 ? parts[2] : "";

  const setMonth = (m) => onChange(m ? `${m}-${dd || "01"}` : (dd ? `01-${dd}` : ""));
  const setDay = (d) => onChange(d ? `${mm || "01"}-${d}` : (mm ? `${mm}-01` : ""));

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

  return (
    <div className="flex gap-2">
      <select
        className={inputCls}
        style={inputStyle}
        value={mm}
        onChange={(e) => setMonth(e.target.value)}
        data-testid={testId ? `${testId}-month` : undefined}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={String(i + 1).padStart(2, "0")}>{name}</option>
        ))}
      </select>
      <select
        className={inputCls}
        style={{ ...inputStyle, maxWidth: 110 }}
        value={dd}
        onChange={(e) => setDay(e.target.value)}
        data-testid={testId ? `${testId}-day` : undefined}
      >
        <option value="">Day</option>
        {days.map((d) => <option key={d} value={d}>{parseInt(d, 10)}</option>)}
      </select>
    </div>
  );
}
