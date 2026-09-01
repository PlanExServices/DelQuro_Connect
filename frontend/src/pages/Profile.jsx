import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { BackHeader } from "@/components/BackHeader";
import { Card, Btn, Field, inputCls, inputStyle, RoleChip } from "@/components/kit";
import { Modal } from "@/components/Modal";

const PREF_LABELS = {
  notify_huddle: "Huddle announcements",
  notify_timeoff: "Time off updates",
  notify_chat: "New chat messages",
  notify_birthdays: "Birthdays & anniversaries",
  compact_mode: "Compact display",
};

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || "", job_title: user?.job_title || "",
    birthday: user?.birthday || "", start_date: user?.start_date || "",
  });
  const [prefs, setPrefs] = useState(user?.preferences || {});
  const [showPwd, setShowPwd] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    try {
      const { data } = await api.patch("/me", form);
      setUser(data); toast.success("Profile updated");
    } catch (e) { toast.error(apiError(e)); }
  };

  const togglePref = async (k) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try {
      const { data } = await api.put("/me/preferences", { preferences: next });
      setUser((u) => ({ ...u, preferences: data.preferences }));
    } catch (e) { toast.error(apiError(e)); }
  };

  const doLogout = () => { logout(); navigate("/login", { replace: true }); };

  return (
    <>
      <BackHeader title="Profile" subtitle="Manage your account" />

      <Card className="p-5 mb-4 flex items-center gap-4">
        <Avatar initials={user?.initials} size={60} teal />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl truncate" style={{ color: "var(--brand)" }}>{user?.name}</p>
          <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{user?.email}</p>
        </div>
        <RoleChip role={user?.role} />
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="font-display text-lg mb-4" style={{ color: "var(--brand)" }}>Details</h3>
        <Field label="Full name"><input className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} data-testid="profile-name" /></Field>
        <Field label="Job title"><input className={inputCls} style={inputStyle} value={form.job_title} onChange={set("job_title")} data-testid="profile-jobtitle" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birthday"><input type="date" className={inputCls} style={inputStyle} value={form.birthday || ""} onChange={set("birthday")} data-testid="profile-birthday" /></Field>
          <Field label="Start date"><input type="date" className={inputCls} style={inputStyle} value={form.start_date || ""} onChange={set("start_date")} data-testid="profile-startdate" /></Field>
        </div>
        <Btn onClick={saveProfile} className="w-full" data-testid="save-profile">Save changes</Btn>
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="font-display text-lg mb-3" style={{ color: "var(--brand)" }}>Preferences</h3>
        {Object.keys(PREF_LABELS).map((k) => (
          <label key={k} className="flex items-center justify-between py-2.5 cursor-pointer">
            <span className="text-sm" style={{ color: "var(--on-surface)" }}>{PREF_LABELS[k]}</span>
            <button onClick={(e) => { e.preventDefault(); togglePref(k); }} className="relative rounded-full transition-colors" style={{ width: 44, height: 26, background: prefs[k] ? "var(--teal)" : "var(--surface-tertiary)" }} data-testid={`pref-${k}`}>
              <span className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: 22, height: 22, left: prefs[k] ? 20 : 2 }} />
            </button>
          </label>
        ))}
      </Card>

      <Card className="p-5 mb-4 space-y-3">
        <Btn variant="ghost" onClick={() => setShowPwd(true)} className="w-full" data-testid="change-password-btn">Change password</Btn>
        <Btn variant="outline" onClick={doLogout} className="w-full" data-testid="logout-btn"><LogOut size={16} /> Sign out</Btn>
        <button onClick={() => setShowDelete(true)} className="w-full text-sm font-medium py-2" style={{ color: "var(--error)" }} data-testid="delete-account-btn">Delete account</button>
      </Card>

      {showPwd && <PasswordModal onClose={() => setShowPwd(false)} />}
      {showDelete && <DeleteModal onClose={() => setShowDelete(false)} onDone={doLogout} />}
    </>
  );
}

function PasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const submit = async () => {
    try { await api.post("/me/password", { current_password: cur, new_password: next }); toast.success("Password changed"); onClose(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Change password" testId="password-modal"
      footer={<Btn onClick={submit} className="w-full" data-testid="submit-password">Update password</Btn>}>
      <Field label="Current password"><input type="password" className={inputCls} style={inputStyle} value={cur} onChange={(e) => setCur(e.target.value)} data-testid="current-password" /></Field>
      <Field label="New password" hint="8+ characters, at least 1 letter & 1 number"><input type="password" className={inputCls} style={inputStyle} value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-password" /></Field>
    </Modal>
  );
}

function DeleteModal({ onClose, onDone }) {
  const [pwd, setPwd] = useState("");
  const submit = async () => {
    try { await api.delete("/me", { data: { current_password: pwd } }); toast.success("Account deleted"); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Delete account" testId="delete-modal"
      footer={<Btn variant="danger" onClick={submit} className="w-full" data-testid="confirm-delete">Delete my account</Btn>}>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>This permanently removes your account. Enter your password to confirm.</p>
      <Field label="Current password"><input type="password" className={inputCls} style={inputStyle} value={pwd} onChange={(e) => setPwd(e.target.value)} data-testid="delete-password" /></Field>
    </Modal>
  );
}
