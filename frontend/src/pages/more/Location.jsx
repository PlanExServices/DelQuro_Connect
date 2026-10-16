import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, MapPin, Pencil, ExternalLink } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { CampusBrand } from "@/components/CampusBrand";
import { useAuth } from "@/context/AuthContext";
import { useCampus } from "@/context/CampusContext";
import { Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState, ErrorState } from "@/components/States";

export default function Location() {
  const { user, setUser } = useAuth();
  const { campus, refreshLocations } = useCampus();
  const [locations, setLocations] = useState(null);
  const [members, setMembers] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [l, m] = await Promise.all([refreshLocations(), api.get("/team/members")]);
      setLocations(l); setMembers(m.data);
    } catch (e) { setError(apiError(e)); }
  }, [refreshLocations]);
  useEffect(() => { load(); }, [load]);

  const assign = async (uid, locationId) => {
    try {
      await api.put(`/team/${uid}/location?location_id=${locationId}`);
      if (uid === user?.id) setUser((current) => ({ ...current, location_id: locationId }));
      toast.success("Assigned"); load();
    }
    catch (e) { toast.error(apiError(e)); }
  };

  const openNew = () => { setEditing(campus?.preview_only ? campus : null); setShow(true); };
  const openEdit = (location) => { setEditing(location); setShow(true); };

  return (
    <>
      <BackHeader title="Campuses & Branding" subtitle="A name, ID tag, logo and colors for each hospital"
        action={<Btn onClick={openNew} data-testid="new-location-btn"><Plus size={16} /> Add campus</Btn>} />
      {error ? <ErrorState message={error} onRetry={load} /> : locations === null ? <Loading /> : (
        <>
          {locations.length === 0 ? (
            <EmptyState icon={MapPin} title="No campuses saved yet" hint="Add COMMON to save the Commonwealth preview branding, then assign teammates." />
          ) : (
            <div className="space-y-3 mb-6">
              {locations.map((l) => (
                <Card key={l.id} className="p-4" data-testid="location-row">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0"><CampusBrand campus={l} /></div>
                    <button type="button" onClick={() => openEdit(l)} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: "var(--brand-tertiary)", color: "var(--brand)" }} aria-label={`Edit ${l.name}`}><Pencil size={15} /> Edit</button>
                  </div>
                  <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-3 text-xs" style={{ borderColor: "var(--divider)", color: "var(--text-secondary)" }}>
                    <span className="font-semibold">ID tag: {l.campus_code}</span>
                    <span className="inline-flex items-center gap-1">Colors <i className="inline-block w-4 h-4 rounded-full border" style={{ background: l.primary_color || "#1B2A4A" }} /><i className="inline-block w-4 h-4 rounded-full border" style={{ background: l.accent_color || "#00A5A8" }} /></span>
                    {l.website_url && <a href={l.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Website <ExternalLink size={13} /></a>}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {locations.length > 0 && members.length > 0 && (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Assign teammates to a campus</h2>
              <div className="space-y-3">
                {members.map((m) => (
                  <Card key={m.id} className="p-4 flex items-center gap-3">
                    <Avatar initials={m.initials} size={40} />
                    <p className="flex-1 min-w-0 font-medium text-[15px] truncate" style={{ color: "var(--brand)" }}>{m.name}</p>
                    <select value={m.location_id || ""} onChange={(e) => assign(m.id, e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={inputStyle} data-testid="assign-location">
                      <option value="">Unassigned</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {show && <LocationEditor initial={editing} onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </>
  );
}

function LocationEditor({ initial, onClose, onDone }) {
  const isEdit = Boolean(initial?.id && !initial.preview_only);
  const [form, setForm] = useState({
    name: initial?.name || "",
    campus_code: initial?.campus_code || "",
    website_url: initial?.website_url || "",
    logo_url: initial?.logo_url || "",
    primary_color: initial?.primary_color || "#1B2A4A",
    accent_color: initial?.accent_color || "#00A5A8",
    soft_color: initial?.soft_color || "#E8F1F5",
  });
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    if (!form.name.trim() || !form.campus_code.trim()) return toast.error("Add the hospital name and ID tag");
    const payload = { ...form, name: form.name.trim(), campus_code: form.campus_code.trim().toUpperCase(), website_url: form.website_url.trim() || null, logo_url: form.logo_url.trim() || null };
    setBusy(true);
    try {
      if (isEdit) await api.put(`/locations/${initial.id}`, payload);
      else await api.post("/locations", payload);
      toast.success(isEdit ? "Campus branding saved" : "Campus added"); onDone();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${initial.campus_code}` : "Add campus"} testId="create-location-modal"
      footer={<Btn onClick={submit} disabled={busy} className="w-full" data-testid="submit-location">{busy ? "Saving…" : isEdit ? "Save campus branding" : "Add campus"}</Btn>}>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>Use the hospital's own name, website logo and colors. The ID tag stays short for schedules and team lists.</p>
      <Field label="Hospital name"><input className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} data-testid="location-name" placeholder="Commonwealth Animal Hospital" maxLength={120} /></Field>
      <Field label="Campus ID tag"><input className={`${inputCls} uppercase`} style={inputStyle} value={form.campus_code} onChange={set("campus_code")} data-testid="location-code" placeholder="COMMON" maxLength={16} /></Field>
      <Field label="Hospital website (optional)"><input className={inputCls} style={inputStyle} value={form.website_url} onChange={set("website_url")} placeholder="https://hospital.example" inputMode="url" /></Field>
      <Field label="Logo URL (optional)"><input className={inputCls} style={inputStyle} value={form.logo_url} onChange={set("logo_url")} placeholder="https://hospital.example/logo.svg" inputMode="url" /></Field>
      <p className="text-xs -mt-2 mb-4" style={{ color: "var(--text-muted)" }}>Use HTTPS or a packaged /brands/ image. COMMON's preview logo came from its public website.</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Primary"><input type="color" aria-label="Primary color" value={form.primary_color} onChange={set("primary_color")} className="w-full h-11 rounded-xl cursor-pointer" /></Field>
        <Field label="Accent"><input type="color" aria-label="Accent color" value={form.accent_color} onChange={set("accent_color")} className="w-full h-11 rounded-xl cursor-pointer" /></Field>
        <Field label="Soft"><input type="color" aria-label="Soft color" value={form.soft_color} onChange={set("soft_color")} className="w-full h-11 rounded-xl cursor-pointer" /></Field>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{form.primary_color.toUpperCase()} · {form.accent_color.toUpperCase()} · {form.soft_color.toUpperCase()}</p>
      <div className="rounded-2xl p-3 mb-3" style={{ background: form.soft_color }}><CampusBrand campus={{ ...form, campus_code: form.campus_code.toUpperCase() }} /></div>
    </Modal>
  );
}
