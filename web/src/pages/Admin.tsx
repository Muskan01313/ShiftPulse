import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/useToast";
import type { Role, Team, User } from "../types";

/** People, teams and the tenant list. Admins only. */
export function Admin() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tab, setTab] = useState<"users" | "teams" | "tenants">("users");

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([api<User[]>("/api/admin/users"), api<Team[]>("/api/admin/teams")]);
      setUsers(u);
      setTeams(t);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  return (
    <main className="wrap">
      <div className="toolbar"><h1 style={{ fontSize: 22 }}>Admin</h1></div>
      <div className="tabs" role="tablist">
        {(["users", "teams", "tenants"] as const).map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ users: "People", teams: "Teams", tenants: "Tenant list" }[t]}</button>
        ))}
      </div>
      {tab === "users" && <Users users={users} teams={teams} meId={me?.id ?? ""} reload={load} />}
      {tab === "teams" && <Teams teams={teams} users={users} reload={load} />}
      {tab === "tenants" && <Tenants />}
    </main>
  );
}

function Users({ users, teams, meId, reload }: { users: User[]; teams: Team[]; meId: string; reload: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Member" as Role, teamId: teams[0]?.id ?? "" });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function patch(id: string, body: Record<string, unknown>, done?: string) {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: body });
      if (done) toast(done);
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/users", { method: "POST", json: { ...form, teamId: form.teamId || teams[0]?.id || null } });
      toast(`${form.name} can now sign in.`);
      setForm({ ...form, name: "", email: "", password: "" });
      await reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <>
      <div className="sheet">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td>{u.email}</td>
                <td>
                  <select className="f" style={{ height: 30 }} aria-label={`Role of ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => void patch(u.id, { role: e.target.value })}>
                    <option>Member</option><option>Manager</option><option>Admin</option>
                  </select>
                </td>
                <td>
                  <select className="f" style={{ height: 30 }} aria-label={`Team of ${u.name}`} value={u.teamId ?? ""} onChange={(e) => void patch(u.id, { teamId: e.target.value })}>
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td>{u.isActive ? <span className="pill ok">Active</span> : <span className="pill">Switched off</span>}</td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  {resetFor === u.id ? (
                    <>
                      <input className="f" style={{ width: 150, height: 28 }} placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />{" "}
                      <button className="btn sm primary" onClick={() => { void patch(u.id, { newPassword }, "Password changed."); setResetFor(null); setNewPassword(""); }}>Save</button>
                    </>
                  ) : <button className="btn sm" onClick={() => setResetFor(u.id)}>Reset password</button>}{" "}
                  {u.id !== meId && <button className="btn sm" onClick={() => void patch(u.id, { isActive: !u.isActive })}>{u.isActive ? "Switch off" : "Switch on"}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" style={{ marginTop: 16 }} onSubmit={add}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Add a person</h3>
        <div className="grid2">
          <label className="field">Name<input className="f" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Email<input className="f" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">First password<input className="f" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label className="field">Role
            <select className="f" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option>Member</option><option>Manager</option><option>Admin</option></select>
          </label>
          <label className="field">Team
            <select className="f" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </label>
        </div>
        <div className="toolbar"><button className="btn primary" type="submit">Add person</button></div>
      </form>
    </>
  );
}

function Teams({ teams, users, reload }: { teams: Team[]; users: User[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Team | null>(null);
  const blank: Team = { id: "", name: "", managerIds: [], shift: { timeZone: "Asia/Kolkata", start: "15:00", end: "00:00", rolloverHour: 4 }, options: { workTypes: [], complexities: [], statuses: [] }, reportEmails: [] };
  const managers = users.filter((u) => u.role !== "Member" && u.isActive);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = { name: editing.name, managerIds: editing.managerIds, shift: editing.shift, reportEmails: editing.reportEmails };
    try {
      if (editing.id) await api(`/api/admin/teams/${editing.id}`, { method: "PUT", json: body });
      else await api("/api/admin/teams", { method: "POST", json: body });
      toast("Team saved.");
      setEditing(null);
      await reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <>
      <div className="sheet">
        <table>
          <thead><tr><th>Team</th><th>Managers</th><th>Shift</th><th>Report emails</th><th /></tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td>{t.managerIds.map((id) => users.find((u) => u.id === id)?.name ?? "?").join(", ") || "—"}</td>
                <td className="num">{t.shift.start}–{t.shift.end} {t.shift.timeZone}</td>
                <td>{t.reportEmails.join(", ") || "—"}</td>
                <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => setEditing(t)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar"><button className="btn primary" onClick={() => setEditing(blank)}>+ New team</button></div>
      {editing && (
        <div className="overlay" onMouseDown={() => setEditing(null)}>
          <form className="panel" onMouseDown={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="panel-h"><h2>{editing.id ? `Edit ${editing.name}` : "New team"}</h2><span className="spacer" /><button type="button" className="btn" onClick={() => setEditing(null)}>Close</button></div>
            <div className="grid2">
              <label className="field">Team name<input className="f" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label className="field">Time zone<input className="f" value={editing.shift.timeZone} onChange={(e) => setEditing({ ...editing, shift: { ...editing.shift, timeZone: e.target.value } })} /></label>
              <label className="field">Shift starts<input className="f" type="time" value={editing.shift.start} onChange={(e) => setEditing({ ...editing, shift: { ...editing.shift, start: e.target.value } })} /></label>
              <label className="field">Shift ends<input className="f" type="time" value={editing.shift.end} onChange={(e) => setEditing({ ...editing, shift: { ...editing.shift, end: e.target.value } })} /></label>
              <label className="field">Work locks at (hour, next morning)<input className="f" type="number" min={0} max={12} value={editing.shift.rolloverHour} onChange={(e) => setEditing({ ...editing, shift: { ...editing.shift, rolloverHour: Number(e.target.value) } })} /></label>
            </div>
            <label className="field" style={{ marginTop: 12 }}>Report emails (one per line)
              <textarea className="f" rows={3} value={editing.reportEmails.join("\n")} onChange={(e) => setEditing({ ...editing, reportEmails: e.target.value.split("\n") })} />
            </label>
            <fieldset className="card" style={{ marginTop: 12 }}>
              <legend style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>Managers (people with the Manager or Admin role)</legend>
              {managers.length === 0 && <span className="hint">Give someone the Manager role in People first.</span>}
              {managers.map((u) => (
                <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                  <input type="checkbox" checked={editing.managerIds.includes(u.id)} onChange={(e) => setEditing({ ...editing, managerIds: e.target.checked ? [...editing.managerIds, u.id] : editing.managerIds.filter((x) => x !== u.id) })} />
                  {u.name} <span className="hint" style={{ margin: 0 }}>{u.role}</span>
                </label>
              ))}
            </fieldset>
            <div className="toolbar"><button className="btn primary" type="submit">Save team</button></div>
          </form>
        </div>
      )}
    </>
  );
}

function Tenants() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const r = await api<{ tenants: number; active: number }>("/api/admin/tenants/import", { method: "POST", body });
      setResult(`Imported ${r.tenants} tenants (${r.active} active). Analysts see the active ones in Stub Name, each with its own programs in Domain.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card" style={{ marginTop: 16, maxWidth: 640 }}>
      <h3 style={{ fontSize: 15 }}>Import the tenant sheet</h3>
      <p className="hint" style={{ fontSize: 13 }}>Upload the tenants CSV export. ShiftPulse keeps only TenantId, Caption (the program shown as Domain) and IsActive. Every other column, including contact details, is ignored. Importing again updates the list.</p>
      <div className="toolbar">
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        {busy && <span className="hint" style={{ margin: 0 }}>Importing…</span>}
      </div>
      {result && <p style={{ marginBottom: 0 }}>{result}</p>}
    </div>
  );
}
