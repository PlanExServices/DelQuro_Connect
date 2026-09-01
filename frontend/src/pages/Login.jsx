import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/auth/status").then(({ data }) => {
      if (data.needs_setup) navigate("/setup", { replace: true });
    }).catch(() => {});
  }, [navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(form.email, form.password);
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
        <div className="bg-white rounded-[28px] card-shadow-lg p-8 sm:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <Logo size={52} stacked />
            <p className="text-sm mt-5" style={{ color: "var(--text-secondary)" }}>
              Your veterinary team, aligned every shift.
            </p>
          </div>
          <form onSubmit={submit}>
            <Field label="Email">
              <input data-testid="login-email" type="email" className={inputCls} style={inputStyle} value={form.email} onChange={set("email")} placeholder="you@hospital.com" required />
            </Field>
            <Field label="Password">
              <input data-testid="login-password" type="password" className={inputCls} style={inputStyle} value={form.password} onChange={set("password")} required />
            </Field>
            <Btn type="submit" disabled={busy} className="w-full mt-2" data-testid="login-submit">
              {busy ? "Signing in…" : "Sign In"}
            </Btn>
          </form>
          <p className="text-sm text-center mt-6" style={{ color: "var(--text-secondary)" }}>
            New here? <Link to="/register" className="font-semibold" style={{ color: "var(--teal)" }}>Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
