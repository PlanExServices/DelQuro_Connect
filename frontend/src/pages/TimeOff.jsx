import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, X, SlidersHorizontal } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { longDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { PageHeader, Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading } from "@/components/States";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const STATUS_COLOR = { pending: "var(--warning)", approved: "var(--success)", declined: "var(--error)" };
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function TimeOff() {
  const { user } = useAuth();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(iso(today.getFullYear(), today.getMonth(), today.getDate()));
  const [month, setMonth] = useState([]);
  const [dayReqs, setDayReqs] = useState(null);
  const [limit, setLimit] = useState(null);
  const [showReq, setShowReq] = useState(false);
  const [showLimit, setShowLimit] = useState(false);

  const perms = user?.permissions || {};

  const loadMonth = useCallback(async () => {
    try {
      const { data } = await api.get(`/timeoff/month?year=${cursor.y}&month=${cursor.m + 1}`);
      setMonth(data);
    } catch (e) { toast.error(apiError(e)); }
  }, [cursor]);

  const loadDay = useCallback(async () => {
    setDayReqs(null);
    try {
      const [r, l] = await Promise.all([
        api.get(`/timeoff?date=${selected}`),
        api.get(`/daylimit?date=${selected}`),
      ]);
      setDayReqs(r.data); setLimit(l.data);
    } catch (e) { toast.error(apiError(e)); }
  }, [selected]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadDay(); }, [loadDay]);

  const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const dotsFor = (d) => {
    const date = iso(cursor.y, cursor.m, d);
    const set = new Set(month.filter((t) => t.date === date).map((t) => t.status));
    return [...set];
  };

  const move = (dir) => setCursor((c) => {
    let m = c.m + dir, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });

  const setStatus = async (id, status) => {
    try { await api.put(`/timeoff/${id}/status?status=${status}`); loadDay(); loadMonth(); toast.success(`Marked ${status}`); }
    catch (e) { toast.error(apiError(e)); }
  };

  const MONTH_NAME = new Date(cursor.y, cursor.m).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Time Off" subtitle="View and manage time off requests" />

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => move(-1)} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: "var(--surface-tertiary)" }} data-testid="cal-prev"><ChevronLeft size={18} color="var(--brand)" /></button>
          <h3 className="font-display text-lg" style={{ color: "var(--brand)" }}>{MONTH_NAME}</h3>
          <button onClick={() => move(1)} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: "var(--surface-tertiary)" }} data-testid="cal-next"><ChevronRight size={18} color="var(--brand)" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map((d) => <div key={d} className="text-center text-xs font-semibold py-1" style={{ color: "var(--text-muted)" }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const date = iso(cursor.y, cursor.m, d);
            const isSel = date === selected;
            return (
              <button key={i} onClick={() => setSelected(date)} data-testid={`cal-day-${d}`}
                className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-colors"
                style={{ background: isSel ? "var(--brand)" : "transparent", color: isSel ? "#fff" : "var(--on-surface)" }}>
                <span className="text-sm font-medium">{d}</span>
                <div className="flex gap-0.5 h-1.5">
                  {dotsFor(d).map((s) => <span key={s} className="rounded-full" style={{ width: 5, height: 5, background: isSel ? "#fff" : STATUS_COLOR[s] }} />)}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 mt-4 justify-center">
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 8, height: 8, background: c }} /><span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{k}</span></div>
          ))}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-around text-center">
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Day limit</p>
            <p className="font-display text-4xl" style={{ color: "var(--brand)" }}>{limit?.limit ?? "—"}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{limit ? `${limit.remaining} spots remaining` : ""}</p>
          </div>
          <div className="w-px self-stretch" style={{ background: "var(--divider)" }} />
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Approved</p>
            <p className="font-display text-4xl" style={{ color: "var(--success)" }}>{limit?.approved ?? "—"}</p>
          </div>
        </div>
      </Card>

      <div className="flex gap-3 mb-4">
        {perms.set_daylimit && <Btn variant="ghost" onClick={() => setShowLimit(true)} data-testid="daylimit-btn"><SlidersHorizontal size={16} /> Day limit</Btn>}
        <Btn className="flex-1" onClick={() => setShowReq(true)} data-testid="request-btn">
          {perms.approve_timeoff ? "Approved entry" : "Request time off"}
        </Btn>
      </div>

      <p className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>{longDate(selected)}</p>
      {dayReqs === null ? <Loading /> : dayReqs.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm" style={{ color: "var(--text-muted)" }}>No requests for this day.</p></Card>
      ) : (
        <div className="space-y-3">
          {dayReqs.map((r) => (
            <Card key={r.id} className="p-4 flex items-center gap-3" data-testid="timeoff-row">
              <Avatar initials={r.initials} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px]" style={{ color: "var(--brand)" }}>{r.name}</p>
                <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{r.reason || "Time off"}</p>
              </div>
              {perms.approve_timeoff && r.status === "pending" ? (
                <div className="flex gap-2">
                  <button onClick={() => setStatus(r.id, "approved")} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "rgba(34,197,94,0.12)" }} data-testid="approve-btn"><Check size={18} color="var(--success)" /></button>
                  <button onClick={() => setStatus(r.id, "declined")} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: "rgba(239,68,68,0.12)" }} data-testid="decline-btn"><X size={18} color="var(--error)" /></button>
                </div>
              ) : (
                <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full capitalize" style={{ background: "var(--brand-tertiary)", color: STATUS_COLOR[r.status] }}>{r.status}</span>
              )}
            </Card>
          ))}
        </div>
      )}

      {showReq && <RequestModal date={selected} canApprove={perms.add_approved_timeoff} onClose={() => setShowReq(false)} onDone={() => { setShowReq(false); loadDay(); loadMonth(); }} />}
      {showLimit && <LimitModal date={selected} current={limit?.limit ?? 3} onClose={() => setShowLimit(false)} onDone={() => { setShowLimit(false); loadDay(); }} />}
    </>
  );
}

function RequestModal({ date, canApprove, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const submit = async () => {
    try {
      await api.post("/timeoff", { date, reason, status: approved && canApprove ? "approved" : "pending" });
      toast.success("Request submitted");
      onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Time off request" testId="request-modal"
      footer={<Btn onClick={submit} className="w-full" data-testid="submit-request">Submit</Btn>}>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{longDate(date)}</p>
      <Field label="Reason (optional)">
        <textarea className={inputCls} style={inputStyle} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason-input" />
      </Field>
      {canApprove && (
        <label className="flex items-center gap-3 cursor-pointer mb-2">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} data-testid="approved-toggle" />
          <span className="text-sm" style={{ color: "var(--brand)" }}>Add as an already-approved entry</span>
        </label>
      )}
    </Modal>
  );
}

function LimitModal({ date, current, onClose, onDone }) {
  const [val, setVal] = useState(current);
  const submit = async () => {
    try { await api.put("/daylimit", { date, limit: Number(val) }); toast.success("Day limit updated"); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Set day limit" testId="limit-modal"
      footer={<Btn onClick={submit} className="w-full" data-testid="submit-limit">Save</Btn>}>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{longDate(date)}</p>
      <Field label="Maximum approved days off">
        <input type="number" min={0} className={inputCls} style={inputStyle} value={val} onChange={(e) => setVal(e.target.value)} data-testid="limit-input" />
      </Field>
    </Modal>
  );
}
