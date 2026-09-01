import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

const STEPS = [
  "Create your admin account",
  "Invite your team",
  "Start every shift aligned",
];

export default function Setup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", bootstrap_code: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/auth/status").then(({ data }) => {
      if (!data.needs_setup) navigate("/login", { replace: true });
    }).catch(() => {});
  }, [navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form);
      toast.success("Workspace created. Welcome aboard!");
      navigate("/huddle", { replace: true });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center px-16 text-white" style={{ background: "var(--brand)" }}>
        <Logo size={44} />
        <p className="mt-12 text-xs uppercase tracking-[0.25em]" style={{ color: "var(--teal)" }}>Welcome to</p>
        <h1 className="font-display text-5xl mt-2 leading-tight">Delquro Connect</h1>
        <p className="mt-4 text-[15px] max-w-md" style={{ color: "rgba(255,255,255,0.7)" }}>
          Let's set up your workspace. You'll be the first administrator.
        </p>
        <ol className="mt-10 space-y-5">
          {STEPS.map((s, i) => (
            <li key={i} className="flex items-center gap-4">
              <span className="grid place-items-center rounded-full font-display font-semibold" style={{ width: 34, height: 34, background: "var(--teal)" }}>{i + 1}</span>
              <span className="text-[15px]" style={{ color: "rgba(255,255,255,0.9)" }}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10" style={{ background: "var(--surface)" }}>
        <div className="w-full max-w-md animate-fade-up">
          <div className="lg:hidden mb-8"><Logo size={40} /></div>
          <p className="text-xs uppercase tracking-[0.25em] mb-1" style={{ color: "var(--teal)" }}>Welcome to</p>
          <h2 className="font-display text-3xl mb-2" style={{ color: "var(--brand)" }}>Set up your workspace</h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>You'll be the first administrator.</p>
          <form onSubmit={submit}>
            <Field label="Full name">
              <input data-testid="setup-name" className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} placeholder="Jane Doe" required />
            </Field>
            <Field label="Work email">
              <input data-testid="setup-email" type="email" className={inputCls} style={inputStyle} value={form.email} onChange={set("email")} placeholder="you@hospital.com" required />
            </Field>
            <Field label="Password" hint="8+ characters, at least 1 letter & 1 number">
              <input data-testid="setup-password" type="password" className={inputCls} style={inputStyle} value={form.password} onChange={set("password")} required />
            </Field>
            <Field label="Setup code" hint="The one-time code from your administrator">
              <input data-testid="setup-code" className={inputCls} style={inputStyle} value={form.bootstrap_code} onChange={set("bootstrap_code")} placeholder="DELQURO-SETUP-…" required />
            </Field>
            <Btn type="submit" disabled={busy} className="w-full mt-2" data-testid="setup-submit">
              {busy ? "Creating…" : "Create workspace"}
            </Btn>
          </form>
          <p className="text-sm text-center mt-6" style={{ color: "var(--text-secondary)" }}>
            Already set up? <Link to="/login" className="font-semibold" style={{ color: "var(--teal)" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
