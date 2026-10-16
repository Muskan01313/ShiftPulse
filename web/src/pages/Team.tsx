import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, download } from "../api";
import { useToast } from "../components/useToast";
import { addDays, clock, hm, mondayOf, monthRange, niceDay, parseClock } from "../time";
import type { Team as TeamT, TeamOptions, TeamSummary, Ticket, TicketFields, User } from "../types";

interface ManagedTeam {
  team: TeamT;
  currentShiftDate: string;
  members: User[];
}
type Tab = "summary" | "tickets" | "members" | "dropdowns";

/** Managers see their own teams here; admins see every team. */
export function TeamPage() {
  const [teams, setTeams] = useState<ManagedTeam[] | null>(null);
  const [teamId, setTeamId] = useState<string>(() => localStorage.getItem("shiftpulse-team") ?? "");
  const [tab, setTab] = useState<Tab>("summary");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ManagedTeam[]>("/api/manage/teams");
      setTeams(data);
      setTeamId((id) => (data.some((t) => t.team.id === id) ? id : data[0]?.team.id ?? ""));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => localStorage.setItem("shiftpulse-team", teamId), [teamId]);

  const current = teams?.find((t) => t.team.id === teamId);
  if (error) return <main className="wrap"><div className="error">{error}</div></main>;
  if (!teams) return <main className="wrap"><div className="blank">Loading…</div></main>;
  if (!current) return <main className="wrap"><div className="blank">You don't manage a team yet. Ask an admin to add you as a team's manager.</div></main>;

  return (
    <main className="wrap">
      <div className="toolbar">
        <h1 style={{ fontSize: 22 }}>{current.team.name}</h1>
        {teams.length > 1 && (
          <select className="f" style={{ width: "auto" }} aria-label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => <option key={t.team.id} value={t.team.id}>{t.team.name}</option>)}
          </select>
        )}
        <span className="hint" style={{ margin: 0 }}>{current.members.filter((m) => m.isActive).length} active members · shift {current.team.shift.start}–{current.team.shift.end}</span>
      </div>
      <div className="tabs" role="tablist">
        {(["summary", "tickets", "members", "dropdowns"] as Tab[]).map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {{ summary: "Time summary", tickets: "All tickets", members: "Members", dropdowns: "Dropdowns" }[t]}
          </button>
        ))}
      </div>
      {tab === "summary" && <Summary key={teamId} mt={current} />}
      {tab === "tickets" && <Tickets key={teamId} mt={current} />}
      {tab === "members" && <Members key={teamId} mt={current} reload={load} />}
      {tab === "dropdowns" && <Dropdowns key={teamId} mt={current} reload={load} />}
    </main>
  );
}

function Summary({ mt }: { mt: ManagedTeam }) {
  const toast = useToast();
  const [mode, setMode] = useState<"day" | "week">("day");
  const [day, setDay] = useState(mt.currentShiftDate);
  const [data, setData] = useState<TeamSummary | null>(null);
  const [from, to] = mode === "day" ? [day, day] : [mondayOf(day), addDays(mondayOf(day), 6)];

  const load = useCallback(async () => {
    try {
      setData(await api<TeamSummary>(`/api/manage/teams/${mt.team.id}/summary?from=${from}&to=${to}`));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [mt.team.id, from, to, toast]);
  useEffect(() => {
    setData(null);
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const live = mode === "day" && day === mt.currentShiftDate;
  const days = data ? (mode === "day" ? [from] : data.days.filter((d, i) => i < 5 || data.analysts.some((a) => a.secondsByDay[d]))) : [];
  const head = mode === "day"
    ? ["Analyst", "Tickets", "Completed", "Time", ...(live ? ["Still open"] : [])]
    : ["Analyst", ...days.map((d) => niceDay(d)), "Week total", "Tickets", "Completed"];
  const rows = (data?.analysts ?? []).map((a) => mode === "day"
    ? [a.name, a.tickets, a.completed, hm(a.totalSeconds), ...(live ? [hm(a.openSeconds)] : [])]
    : [a.name, ...days.map((d) => hm(a.secondsByDay[d] ?? 0)), hm(a.totalSeconds), a.tickets, a.completed]);
  const sum = (f: (a: TeamSummary["analysts"][number]) => number) => (data?.analysts ?? []).reduce((s, a) => s + f(a), 0);
  const foot = mode === "day"
    ? ["Team total", sum((a) => a.tickets), sum((a) => a.completed), hm(sum((a) => a.totalSeconds)), ...(live ? [hm(sum((a) => a.openSeconds))] : [])]
    : ["Team total", ...days.map((d) => hm(sum((a) => a.secondsByDay[d] ?? 0))), hm(sum((a) => a.totalSeconds)), sum((a) => a.tickets), sum((a) => a.completed)];

  async function copy() {
    const title = mode === "day" ? `${mt.team.name}: time worked, shift of ${niceDay(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : `${mt.team.name}: week of ${niceDay(from, { day: "numeric", month: "long", year: "numeric" })}`;
    try {
      await navigator.clipboard.writeText([title, "", ...[head, ...rows, foot].map((l) => l.join("\t"))].join("\n"));
      toast("Summary copied. Paste it into an email, chat or a sheet.");
    } catch {
      toast("Your browser blocked copying.");
    }
  }

  const step = mode === "day" ? 1 : 7;
  return (
    <>
      <div className="toolbar">
        <button className="chip" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Daily</button>
        <button className="chip" aria-pressed={mode === "week"} onClick={() => setMode("week")}>Weekly</button>
        <span className="sep" />
        <button className="btn sm" aria-label="Previous" onClick={() => setDay(addDays(day, -step))}>‹</button>
        <b>{mode === "day" ? (live ? "Current shift, " : "") + niceDay(from, { weekday: "long", day: "numeric", month: "long" }) : `${niceDay(from, { day: "numeric", month: "short" })} – ${niceDay(addDays(from, 4), { day: "numeric", month: "short", year: "numeric" })}`}</b>
        <button className="btn sm" aria-label="Next" onClick={() => setDay(addDays(day, step))}>›</button>
        {day !== mt.currentShiftDate && <button className="chip" onClick={() => setDay(mt.currentShiftDate)}>{mode === "day" ? "Current shift" : "This week"}</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => void load()}>Refresh</button>
        <button className="btn" disabled={!data?.analysts.length} onClick={() => void copy()}>Copy summary</button>
      </div>
      {!data ? <div className="blank">Loading…</div> : !data.analysts.length ? <div className="blank">No one in this team yet. Add members in the Members tab.</div> : (
        <div className="sheet">
          <table>
            <thead><tr>{head.map((h, i) => <th key={h + i} className={i ? "n" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i} className={i ? "n" + (c === "0h 00m" || c === 0 ? " zero" : "") : ""}>{c}</td>)}</tr>)}
              <tr className="total">{foot.map((c, i) => <td key={i} className={i ? "n" : ""}>{c}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">Updates every minute. Daily and weekly emails go to the team's report list once the shift ends.</p>
    </>
  );
}

function Tickets({ mt }: { mt: ManagedTeam }) {
  const toast = useToast();
  const [range, setRange] = useState<"shift" | "week" | "month" | "custom">("shift");
  const [custom, setCustom] = useState({ from: addDays(mt.currentShiftDate, -30), to: mt.currentShiftDate });
  const [who, setWho] = useState("");
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const today = mt.currentShiftDate;
  const [from, to] = range === "shift" ? [today, today] : range === "week" ? [mondayOf(today), addDays(mondayOf(today), 6)] : range === "month" ? monthRange(today) : [custom.from, custom.to];
  const names = useMemo(() => Object.fromEntries(mt.members.map((m) => [m.id, m.name])), [mt.members]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ serverNow: string; tickets: Ticket[] }>(`/api/manage/teams/${mt.team.id}/tickets?from=${from}&to=${to}${who ? `&userId=${who}` : ""}`);
      setOffset(new Date(data.serverNow).getTime() - Date.now());
      setRows(data.tickets);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [mt.team.id, from, to, who, toast]);
  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const secs = (t: Ticket) => t.timerSeconds + (t.timerStartedAt ? Math.max(0, (Date.now() + offset - new Date(t.timerStartedAt).getTime()) / 1000) : 0);
  return (
    <>
      <div className="toolbar">
        {(["shift", "week", "month", "custom"] as const).map((r) => (
          <button key={r} className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{{ shift: "Current shift", week: "This week", month: "This month", custom: "Custom" }[r]}</button>
        ))}
        {range === "custom" && (
          <>
            <input type="date" className="chip" aria-label="From" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
            <span>to</span>
            <input type="date" className="chip" aria-label="To" value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
          </>
        )}
        <select className="f" style={{ width: "auto", height: 30 }} aria-label="Analyst" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Everyone</option>
          {mt.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn" disabled={!rows?.length} onClick={() => download(`/api/manage/teams/${mt.team.id}/export.csv?from=${from}&to=${to}`, `shiftpulse-${from}-to-${to}.csv`).catch((e) => toast(e.message))}>Download CSV</button>
      </div>
      {!rows ? <div className="blank">Loading…</div> : !rows.length ? <div className="blank">No tickets in this period.</div> : (
        <div className="sheet">
          <table>
            <thead><tr>{["Recorded Time", "Ticket Number", "Stub Name", "Domain", "Analyst", "New/BAU", "Form Complexity", "Count", "Comments", "VSTS Number", "Status", "Date", ""].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={t.timerStartedAt ? "running" : ""}>
                  <td className="num">{clock(secs(t))}</td>
                  <td><b>{t.ticketNumber || "—"}</b></td>
                  <td>{t.stubName || "—"}</td>
                  <td>{t.domain || "—"}</td>
                  <td>{t.analystName || names[t.userId]}</td>
                  <td>{t.workType || "—"}</td>
                  <td>{t.formComplexity || "—"}</td>
                  <td className="n">{t.completedCount ?? "—"}</td>
                  <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.comments}>{t.comments || "—"}</td>
                  <td>{t.vstsNumber || "—"}</td>
                  <td>{t.status ? <span className={"pill" + (/complete/i.test(t.status) ? " ok" : /hold/i.test(t.status) ? " warn" : "")}>{t.status}</span> : "—"}</td>
                  <td className="num">{t.shiftDate}{t.state === "Open" && <span className="pill warn" style={{ marginLeft: 6 }}>open</span>}</td>
                  <td><button className="btn sm" onClick={() => setEditing(t)}>Correct</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <Correction ticket={editing} seconds={secs(editing)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </>
  );
}

function Correction({ ticket, seconds, onClose, onSaved }: { ticket: Ticket; seconds: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<TicketFields>({ ticketNumber: ticket.ticketNumber, stubName: ticket.stubName, domain: ticket.domain, workType: ticket.workType, formComplexity: ticket.formComplexity, completedCount: ticket.completedCount, comments: ticket.comments, vstsNumber: ticket.vstsNumber, status: ticket.status });
  const [time, setTime] = useState(clock(seconds));
  async function save(e: FormEvent) {
    e.preventDefault();
    const s = parseClock(time);
    if (s === null) return toast("Type a time like 1:05:00.");
    try {
      await api(`/api/manage/tickets/${ticket.id}`, { method: "PUT", json: { fields: f, timerSeconds: s } });
      toast("Correction saved and logged.");
      onSaved();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  const text = (k: keyof TicketFields, label: string) => (
    <label className="field" key={k}>{label}<input className="f" value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="panel" onMouseDown={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="panel-h"><h2>Correct ticket {ticket.ticketNumber}</h2><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Close</button></div>
        <div className="grid2">
          {text("ticketNumber", "Ticket Number")}{text("stubName", "Stub Name")}{text("domain", "Domain")}{text("workType", "New/BAU")}
          {text("formComplexity", "Form Complexity")}
          <label className="field">Completed Count<input className="f" type="number" min={1} max={100} value={f.completedCount ?? ""} onChange={(e) => setF({ ...f, completedCount: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className="field">Total AHT<input className="f num" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          {text("vstsNumber", "VSTS Number")}{text("status", "Status")}{text("comments", "Comments")}
        </div>
        <p className="hint">Corrections are saved in the audit log with your name.</p>
        <div className="toolbar"><button className="btn primary" type="submit">Save correction</button></div>
      </form>
    </div>
  );
}

function Members({ mt, reload }: { mt: ManagedTeam; reload: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/manage/teams/${mt.team.id}/members`, { method: "POST", json: form });
      toast(`${form.name} can now sign in with ${form.email}.`);
      setForm({ name: "", email: "", password: "" });
      await reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function setActive(u: User, active: boolean) {
    try {
      await api(`/api/manage/teams/${mt.team.id}/members/${u.id}/active?active=${active}`, { method: "POST" });
      await reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <>
      <div className="sheet">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {mt.members.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td><td>{u.email}</td><td>{u.role}</td>
                <td>{u.isActive ? <span className="pill ok">Active</span> : <span className="pill">Switched off</span>}</td>
                <td style={{ textAlign: "right" }}>{u.role === "Member" && <button className="btn sm" onClick={() => void setActive(u, !u.isActive)}>{u.isActive ? "Switch off" : "Switch on"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" style={{ marginTop: 16 }} onSubmit={add}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Add an analyst</h3>
        <div className="grid2">
          <label className="field">Name<input className="f" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Email<input className="f" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">First password<input className="f" type="text" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        </div>
        <div className="toolbar"><button className="btn primary" type="submit">Add analyst</button><span className="hint" style={{ margin: 0 }}>Share the password with them privately; they can change it after signing in.</span></div>
      </form>
    </>
  );
}

function Dropdowns({ mt, reload }: { mt: ManagedTeam; reload: () => Promise<void> }) {
  const toast = useToast();
  const lines = (l: string[]) => l.join("\n");
  const [v, setV] = useState({ workTypes: lines(mt.team.options.workTypes), complexities: lines(mt.team.options.complexities), statuses: lines(mt.team.options.statuses) });
  async function save() {
    const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      await api<TeamOptions>(`/api/manage/teams/${mt.team.id}/options`, { method: "PUT", json: { workTypes: split(v.workTypes), complexities: split(v.complexities), statuses: split(v.statuses) } });
      toast("Dropdowns saved.");
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <p className="hint" style={{ fontSize: 13 }}>One choice per line, in the order analysts should see them. Stub Name and Domain come from the tenant list an admin imports.</p>
      <div className="grid2" style={{ marginTop: 12 }}>
        {([["workTypes", "New/BAU"], ["complexities", "Form Complexity"], ["statuses", "Status"]] as const).map(([k, l]) => (
          <label key={k} className="field">{l}<textarea className="f" rows={11} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
        ))}
      </div>
      <div className="toolbar"><button className="btn primary" onClick={() => void save()}>Save dropdowns</button></div>
    </>
  );
}
