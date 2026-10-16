import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getToken } from "../api";
import { useAuth } from "../auth";
import { Combo } from "../components/Combo";
import { useToast } from "../components/useToast";
import { clock, niceDay, parseClock } from "../time";
import type { Team, TeamOptions, Tenant, Ticket, TicketFields } from "../types";

const COUNTS = Array.from({ length: 100 }, (_, i) => String(i + 1));
const CURRENT_KEY = "shiftpulse-current-ticket";
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

type FieldKey = keyof TicketFields | "analystName" | "aht";
// The tiles, in the order of the team's old tracker.
const TILES: { key: FieldKey; label: string }[] = [
  { key: "ticketNumber", label: "Ticket Number" },
  { key: "stubName", label: "Stub Name" },
  { key: "domain", label: "Domain" },
  { key: "analystName", label: "Analyst" },
  { key: "workType", label: "New/BAU" },
  { key: "formComplexity", label: "Form Complexity" },
  { key: "completedCount", label: "Completed Count" },
  { key: "aht", label: "Total AHT" },
  { key: "comments", label: "Comments" },
  { key: "vstsNumber", label: "VSTS Number" },
  { key: "status", label: "Status" },
];

const fieldsOf = (t: Ticket): TicketFields => ({
  ticketNumber: t.ticketNumber, stubName: t.stubName, domain: t.domain, workType: t.workType, formComplexity: t.formComplexity,
  completedCount: t.completedCount, comments: t.comments, vstsNumber: t.vstsNumber, status: t.status,
});

interface ShiftResponse {
  shiftDate: string;
  closesAt: string;
  serverNow: string;
  tickets: Ticket[];
}

export function Tracker() {
  const { user, team } = useAuth();
  const toast = useToast();
  const [shift, setShift] = useState<ShiftResponse | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [options, setOptions] = useState<TeamOptions>({ workTypes: [], complexities: [], statuses: [] });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(CURRENT_KEY));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [sureDelete, setSureDelete] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const tilesRef = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<string, TicketFields>());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    try {
      const data = await api<ShiftResponse>("/api/tickets/shift");
      setShift(data);
      setOffset(new Date(data.serverNow).getTime() - Date.now());
      // Keep edits that haven't reached the server yet.
      setTickets(data.tickets.map((t) => (pending.current.has(t.id) ? { ...t, ...pending.current.get(t.id)! } : t)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    api<TeamOptions>("/api/options").then(setOptions).catch(() => {});
    api<Tenant[]>("/api/tenants").then(setTenants).catch(() => {});
    // Picks up a shift that ended (tickets lock) and changes from another computer.
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
  }, [currentId]);

  const flush = useCallback(async (keepalive = false) => {
    clearTimeout(timer.current);
    const batch = [...pending.current];
    pending.current.clear();
    if (!batch.length) return;
    setSaveState("saving");
    let failed = false;
    await Promise.all(
      batch.map(async ([id, fields]) => {
        try {
          if (keepalive) {
            // Leaving the page: a request that finishes even after the tab closes.
            await fetch(`${BASE}/api/tickets/${id}`, { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(fields) });
          } else await api(`/api/tickets/${id}`, { method: "PUT", json: fields });
        } catch (e) {
          failed = true;
          if (!(e instanceof ApiError && e.status === 409)) pending.current.set(id, { ...fields, ...pending.current.get(id) });
          else setError(e.message);
        }
      }),
    );
    setSaveState(failed ? "error" : pending.current.size ? "saving" : "saved");
    if (failed && pending.current.size) timer.current = setTimeout(() => void flush(), 5000);
  }, []);

  useEffect(() => {
    const onHide = () => void flush(true);
    const onVis = () => document.visibilityState === "hidden" && onHide();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flush]);

  const current = useMemo(
    () => tickets.find((t) => t.id === currentId) ?? tickets.find((t) => t.timerStartedAt) ?? tickets[tickets.length - 1] ?? null,
    [tickets, currentId],
  );
  const editable = current?.state === "Open";
  const secs = (t: Ticket) => t.timerSeconds + (t.timerStartedAt ? Math.max(0, (now + offset - new Date(t.timerStartedAt).getTime()) / 1000) : 0);

  function edit(patch: Partial<TicketFields>) {
    if (!current || !editable) return;
    const next = { ...current, ...patch };
    setTickets((all) => all.map((t) => (t.id === current.id ? next : t)));
    pending.current.set(current.id, fieldsOf(next));
    if (patch.ticketNumber) setFlagged(false);
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }

  const replace = (t: Ticket) => setTickets((all) => all.map((x) => (x.id === t.id ? t : x)));

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      toast((e as Error).message);
      await load();
      return undefined;
    }
  }

  async function toggleTimer() {
    if (!current) return;
    await flush();
    if (current.timerStartedAt) {
      const t = await run(() => api<Ticket>(`/api/tickets/${current.id}/pause`, { method: "POST" }));
      if (t) replace(t);
    } else {
      const t = await run(() => api<Ticket>(`/api/tickets/${current.id}/start`, { method: "POST" }));
      if (t) await load(); // starting one pauses any other
    }
  }

  async function newTicket(copyFrom?: Ticket) {
    if (current && editable && !current.ticketNumber.trim() && !copyFrom) {
      setFlagged(true);
      toast("Add the ticket number first.");
      focusKey();
      return;
    }
    await flush();
    if (current?.timerStartedAt) {
      const paused = await run(() => api<Ticket>(`/api/tickets/${current.id}/pause`, { method: "POST" }));
      if (paused) replace(paused);
    }
    const fields = copyFrom ? { ...fieldsOf(copyFrom), completedCount: null, comments: "" } : undefined;
    const t = await run(() => api<Ticket>("/api/tickets", { method: "POST", json: fields ?? {} }));
    if (!t) return;
    setTickets((all) => [...all, t]);
    setCurrentId(t.id);
    setSureDelete(false);
    focusKey();
  }

  function focusKey() {
    setTimeout(() => tilesRef.current?.querySelector<HTMLInputElement>("input.key")?.focus(), 0);
  }
  // Moves straight away (not on the next tick), so a fast typist's next letter lands in the next tile.
  function focusNext(from: HTMLElement | null) {
    const all = [...(tilesRef.current?.querySelectorAll<HTMLElement>(".tile .f") ?? [])];
    const i = all.findIndex((n) => n === from || n.contains(from));
    all[i + 1]?.focus();
  }

  async function setTime(text: string) {
    if (!current) return;
    const s = parseClock(text);
    if (s === null) return toast("Type a time like 1:05:00, 25:30 or 45 (minutes).");
    const t = await run(() => api<Ticket>(`/api/tickets/${current.id}/time`, { method: "POST", json: { seconds: s } }));
    if (t) replace(t);
  }

  async function remove() {
    if (!current) return;
    pending.current.delete(current.id);
    const ok = await run(() => api(`/api/tickets/${current.id}`, { method: "DELETE" }));
    if (ok === undefined) return;
    setTickets((all) => all.filter((t) => t.id !== current.id));
    setCurrentId(null);
    setSureDelete(false);
  }

  async function submitShift() {
    await flush();
    const res = await run(() => api<{ submitted: number; skipped: number }>("/api/tickets/submit", { method: "POST", json: {} }));
    setConfirmSubmit(false);
    if (!res) return;
    toast(`Submitted ${res.submitted} ticket${res.submitted === 1 ? "" : "s"} to your manager.` + (res.skipped ? ` ${res.skipped} without a ticket number stayed open.` : ""));
    await load();
  }

  const domains = useMemo(() => {
    const t = tenants.find((x) => x.tenantId === current?.stubName);
    return t?.programs.length ? t.programs : [...new Set(tenants.flatMap((x) => x.programs))].sort((a, b) => a.localeCompare(b));
  }, [tenants, current?.stubName]);

  const open = tickets.filter((t) => t.state === "Open");
  const submitted = tickets.filter((t) => t.state === "Submitted");
  const total = tickets.reduce((a, t) => a + secs(t), 0);
  const running = !!current?.timerStartedAt;

  function tile(key: FieldKey, label: string) {
    if (!current) return null;
    const ro = !editable;
    const enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNext(e.currentTarget);
      }
    };
    switch (key) {
      case "analystName":
        // Open work shows your current name; submitted work keeps the name it was submitted under.
        return <div className="lockval">{(editable ? user?.name : current.analystName) || current.analystName}</div>;
      case "stubName":
        return ro ? <div className="lockval">{current.stubName || "—"}</div> : (
          <Combo label={label} value={current.stubName} options={tenants.map((t) => t.tenantId)} onEnter={(el) => focusNext(el)}
            emptyText={user?.role === "Admin" ? "No tenants yet. Upload the tenant CSV in Admin → Tenant list, then refresh this page." : "No tenants yet. Ask your admin to upload the tenant list."}
            onChange={(v) => {
              // A tenant offers only its own programs; one program is filled in for you.
              const progs = tenants.find((t) => t.tenantId === v)?.programs ?? [];
              edit({ stubName: v, domain: progs.length === 1 ? progs[0] : progs.includes(current.domain) ? current.domain : "" });
            }} />
        );
      case "domain":
      case "workType":
      case "formComplexity":
      case "status": {
        const opts = key === "domain" ? domains : key === "workType" ? options.workTypes : key === "formComplexity" ? options.complexities : options.statuses;
        return ro ? <div className="lockval">{current[key] || "—"}</div> : (
          <Combo label={label} value={current[key]} options={opts} onChange={(v) => edit({ [key]: v })} onEnter={(el) => focusNext(el)}
            emptyText={key === "domain" ? "Pick a Stub Name first, or ask your admin to upload the tenant list." : "No choices yet. A manager can add them in Team → Dropdowns."} />
        );
      }
      case "completedCount":
        return ro ? <div className="lockval">{current.completedCount ?? "—"}</div> : (
          <Combo label={label} value={current.completedCount ? String(current.completedCount) : ""} options={COUNTS}
            onChange={(v) => edit({ completedCount: v ? Number(v) : null })} onEnter={(el) => focusNext(el)} />
        );
      case "aht":
        return running || ro ? <div className="lockval num">{clock(secs(current))}</div> : (
          <input key={current.id + current.timerSeconds} className="f num" aria-label={label} defaultValue={clock(secs(current))}
            title="Type a time like 1:05:00, 25:30 or 45 (minutes)" onFocus={(e) => e.target.select()} onKeyDown={enter}
            onBlur={(e) => e.target.value !== clock(secs(current)) && void setTime(e.target.value)} />
        );
      default:
        return ro ? <div className="lockval">{String(current[key] || "—")}</div> : (
          <input className={"f" + (key === "ticketNumber" ? " key" : "")} aria-label={label} value={String(current[key] ?? "")}
            onChange={(e) => edit({ [key]: e.target.value })} onKeyDown={enter} />
        );
    }
  }

  if (!shift && !error) return <main className="wrap"><div className="blank">Loading your shift…</div></main>;

  return (
    <main className="wrap">
      {error && <div className="error">{error}</div>}
      {shift && (
        <div className="shiftnote">
          <span>Shift: <b>{niceDay(shift.shiftDate, { weekday: "long", day: "numeric", month: "long" })}</b>{team ? `, ${(team as Team).shift.start} to ${(team as Team).shift.end}` : ""}</span>
          <span>Time this shift <b className="num">{clock(total)}</b></span>
          <span>Open <b className="num">{open.length}</b> · Submitted <b className="num">{submitted.length}</b></span>
          <span className="spacer" />
          <span className="save" data-s={saveState}><span className="dot" />{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved yet, retrying" : "All changes saved"}</span>
        </div>
      )}

      {!current ? (
        <div className="blank">
          <span>Start your first ticket of the shift. Fill the tiles one after another, then press Save &amp; next ticket.</span>
          <button className="btn primary" onClick={() => void newTicket()}>+ New ticket</button>
        </div>
      ) : (
        <>
          <div className="tiles-bar">
            <h2>{current.ticketNumber ? `Ticket ${current.ticketNumber}` : "New ticket"}</h2>
            {!editable && <span className="pill ok">Submitted · locked</span>}
            <span className="spacer" />
            <button className="btn primary" onClick={() => void newTicket()}>{editable ? "Save & next ticket" : "+ New ticket"}</button>
            <button className="btn" onClick={() => void newTicket(current)} title="Copy this ticket's details into a new ticket">Duplicate</button>
            {editable && (sureDelete
              ? <button className="btn danger" autoFocus onBlur={() => setTimeout(() => setSureDelete(false), 150)} onClick={() => void remove()}>Delete this ticket?</button>
              : <button className="btn" onClick={() => setSureDelete(true)}>Delete</button>)}
          </div>
          <div ref={tilesRef} className={"tiles" + (running ? " running" : "") + (flagged ? " flag" : "")}>
            <div className="tile rt">
              <span className="tile-l"><b>1</b>Recorded Time</span>
              <div className="tile-clock">{clock(secs(current))}</div>
              {editable && (
                <button className="go" onClick={() => void toggleTimer()} aria-label={running ? "Pause timer" : "Start timer"}>
                  {running ? "❚❚ Pause" : secs(current) > 0 ? "▶ Resume" : "▶ Start"}
                </button>
              )}
            </div>
            {TILES.map((t, i) => (
              <label className="tile" key={t.key}>
                <span className="tile-l"><b>{i + 2}</b>{t.label}</span>
                {tile(t.key, t.label)}
              </label>
            ))}
          </div>
        </>
      )}

      <div className="section-h">
        <h2>This shift</h2>
        <span className="spacer" />
        <button className="btn primary" disabled={!open.length} onClick={() => setConfirmSubmit(true)}>Submit shift</button>
      </div>
      {confirmSubmit && (
        <div className="confirm">
          <span>Submit {open.filter((t) => t.ticketNumber.trim()).length} open ticket(s)? Running timers stop, and submitted work goes to your manager and can't be changed.</span>
          <button className="btn primary" onClick={() => void submitShift()}>Yes, submit</button>
          <button className="btn" onClick={() => setConfirmSubmit(false)}>Cancel</button>
        </div>
      )}
      {tickets.length === 0 ? (
        <div className="blank">No tickets yet this shift.</div>
      ) : (
        <div className="sheet">
          <table>
            <thead><tr><th>Recorded Time</th><th>Ticket Number</th><th>Stub Name</th><th>Status</th><th /></tr></thead>
            <tbody>
              {[...tickets].reverse().map((t) => (
                <tr key={t.id} className={"click" + (t.timerStartedAt ? " running" : "") + (current?.id === t.id ? " cur" : "")}
                  onClick={() => { setCurrentId(t.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <td className="num">{clock(secs(t))}</td>
                  <td><b>{t.ticketNumber || "No ticket number"}</b></td>
                  <td>{t.stubName || "—"}</td>
                  <td>{t.status || "—"}</td>
                  <td style={{ textAlign: "right" }}>{t.state === "Submitted" ? <span className="pill ok">Submitted</span> : current?.id === t.id ? <span className="hint">Showing above</span> : <span className="hint">Open</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">Everything saves as you type. The clock runs from the moment you press Start, so a reload, closed tab or restart doesn't lose time. Work locks when the shift ends.</p>
    </main>
  );
}
