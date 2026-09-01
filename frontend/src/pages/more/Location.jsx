import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, MapPin } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { Card, Btn, Field, inputCls, inputStyle } from "@/components/kit";
import { Loading, EmptyState } from "@/components/States";

export default function Location() {
  const [locations, setLocations] = useState(null);
  const [members, setMembers] = useState([]);
  const [show, setShow] = useState(false);

  const load = async () => {
    try {
      const [l, m] = await Promise.all([api.get("/locations"), api.get("/team/members")]);
      setLocations(l.data); setMembers(m.data);
    } catch (e) { toast.error(apiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const assign = async (uid, locationId) => {
    try { await api.put(`/team/${uid}/location?location_id=${locationId}`); toast.success("Assigned"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <BackHeader title="Location Settings" subtitle="Manage campuses and assignments"
        action={<Btn onClick={() => setShow(true)} data-testid="new-location-btn"><Plus size={16} /> Add</Btn>} />
      {locations === null ? <Loading /> : (
        <>
          {locations.length === 0 ? (
            <EmptyState icon={MapPin} title="No locations yet" hint="Add your first campus." />
          ) : (
            <div className="space-y-3 mb-6">
              {locations.map((l) => (
                <Card key={l.id} className="p-4 flex items-center gap-3" data-testid="location-row">
                  <div className="grid place-items-center rounded-2xl" style={{ width: 44, height: 44, background: "var(--brand-tertiary)" }}><MapPin size={19} color="var(--teal)" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px]" style={{ color: "var(--brand)" }}>{l.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Campus code: {l.campus_code}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {locations.length > 0 && members.length > 0 && (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Assign members</h2>
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
      {show && <CreateLocation onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </>
  );
}

function CreateLocation({ onClose, onDone }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const submit = async () => {
    if (!name.trim() || !code.trim()) return toast.error("Fill both fields");
    try { await api.post("/locations", { name, campus_code: code }); toast.success("Location added"); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Add location" testId="create-location-modal"
      footer={<Btn onClick={submit} className="w-full" data-testid="submit-location">Add location</Btn>}>
      <Field label="Location name"><input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} data-testid="location-name" placeholder="Downtown Campus" /></Field>
      <Field label="Campus code"><input className={inputCls} style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} data-testid="location-code" placeholder="DTN" /></Field>
    </Modal>
  );
}
