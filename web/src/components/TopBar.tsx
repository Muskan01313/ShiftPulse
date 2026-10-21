import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo, ThemePicker } from "../theme";

const pad = (n: number) => String(n).padStart(2, "0");

/** The live clock in the team's time zone, with how long until the shift starts or ends. */
function ShiftClock() {
  const { team, clockOffset } = useAuth();
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 1000);
    return () => clearInterval(id);
  }, [clockOffset]);

  const shift = team?.shift ?? { timeZone: "Asia/Kolkata", start: "15:00", end: "00:00", rolloverHour: 4 };
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: shift.timeZone, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, weekday: "short", day: "numeric", month: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const mins = ((+parts.hour % 12) + (/pm/i.test(parts.dayPeriod ?? "") ? 12 : 0)) * 60 + +parts.minute;
  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMins(shift.start);
  let end = toMins(shift.end);
  if (end <= start) end += 24 * 60;
  const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`);
  const m = mins < shift.rolloverHour * 60 ? mins + 24 * 60 : mins;
  let state = "off";
  let text: string;
  if (m >= start && m < end) {
    state = "on";
    text = `On shift · ends in ${span(end - m)}`;
  } else if (m < start) {
    state = start - m <= 60 ? "soon" : "off";
    text = `Shift starts in ${span(start - m)}`;
  } else text = `Shift over · locks at ${shift.rolloverHour} AM`;
  const zone = shift.timeZone === "Asia/Kolkata" ? "IST" : shift.timeZone;

  return (
    <div className="clock-top" data-shift={state} role="timer">
      <div className="clock-time">
        <span>
          {parts.hour}:{parts.minute}
        </span>
        <span className="sec">:{parts.second}</span>
        <span className="ampm">{parts.dayPeriod}</span>
      </div>
      <div className="clock-sub">
        <span className="pip" />
        <span>
          {parts.weekday}, {parts.day} {parts.month} {zone} · {text}
        </span>
      </div>
    </div>
  );
}

export function TopBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const manager = user.role === "Manager" || user.role === "Admin";
  return (
    <header className="bar">
      <div className="wrap">
        <div className="bar-left">
          <NavLink to="/" className="brand">
            <Logo /> ShiftPulse
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Tracker
            </NavLink>
            {manager && <NavLink to="/team">Team</NavLink>}
            {user.role === "Admin" && <NavLink to="/admin">Admin</NavLink>}
          </nav>
        </div>
        <ShiftClock />
        <div className="bar-right">
          <ThemePicker />
          <span className="who">{user.name}</span>
          {user.role !== "Member" && <span className="role">{user.role}</span>}
          <button className="btn sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
