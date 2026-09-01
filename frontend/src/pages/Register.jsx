import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "", birthday: "", start_date: "" });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach((k) => { if (!payload[k]) delete payload[k]; });
      await register(payload);
      toast.success("Account created!");
      navigate("/huddle", { replace: true });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--surface)" }}>
      <div className="w-full max-w-md animate-fade-up">
        <button onClick={() => navigate("/login")} className="flex items-center gap-2 mb-6 text-sm font-medium" style={{ color: "var(--text-secondary)" }} data-testid="register-back">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="bg-white rounded-[28px] card-shadow-lg p-8 sm:p-10">
          <h2 className="font-display text-3xl mb-1" style={{ color: "var(--brand)" }}>Create account</h2>
          <p className="text-sm mb-7" style={{ color: "var(--text-secondary)" }}>Join your hospital's team hub.</p>
          <form onSubmit={submit}>
            <Field label="Full name">
              <input data-testid="register-name" className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} required />
            </Field>
            <Field label="Email">
              <input data-testid="register-email" type="email" className={inputCls} style={inputStyle} value={form.email} onChange={set("email")} required />
            </Field>
            <Field label="Password" hint="8+ characters, at least 1 letter & 1 number">
              <input data-testid="register-password" type="password" className={inputCls} style={inputStyle} value={form.password} onChange={set("password")} required />
            </Field>
            <Field label="Invite code (optional)" hint="From your manager, for the right role & campus">
              <input data-testid="register-code" className={inputCls} style={inputStyle} value={form.code} onChange={set("code")} placeholder="e.g. 7KQ2FX" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Birthday (optional)">
                <input data-testid="register-birthday" type="date" className={inputCls} style={inputStyle} value={form.birthday} onChange={set("birthday")} />
              </Field>
              <Field label="Start date (optional)">
                <input data-testid="register-startdate" type="date" className={inputCls} style={inputStyle} value={form.start_date} onChange={set("start_date")} />
              </Field>
            </div>
            <Btn type="submit" disabled={busy} className="w-full mt-2" data-testid="register-submit">
              {busy ? "Creating…" : "Create Account"}
            </Btn>
          </form>
          <p className="text-sm text-center mt-6" style={{ color: "var(--text-secondary)" }}>
            Already have an account? <Link to="/login" className="font-semibold" style={{ color: "var(--teal)" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
