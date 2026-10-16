import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { TopBar } from "./components/TopBar";
import { Admin } from "./pages/Admin";
import { Login } from "./pages/Login";
import { TeamPage } from "./pages/Team";
import { Tracker } from "./pages/Tracker";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login"><div className="hint">Loading ShiftPulse…</div></div>;
  if (!user) return <Login />;
  const manager = user.role === "Manager" || user.role === "Admin";
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<Tracker />} />
        <Route path="/team" element={manager ? <TeamPage /> : <Navigate to="/" replace />} />
        <Route path="/admin" element={user.role === "Admin" ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
