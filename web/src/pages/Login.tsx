import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { Logo } from "../theme";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <Logo size={40} />
        <h1>Sign in to ShiftPulse</h1>
        <p>Track your tickets and time for the shift.</p>
        <label className="field">
          Email
          <input className="f" id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input className="f" id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy} style={{ height: 40 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint">Forgot your password? Ask your manager or admin to reset it.</p>
      </form>
    </div>
  );
}
