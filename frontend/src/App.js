import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

import Setup from "@/pages/Setup";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Huddle from "@/pages/Huddle";
import TimeOff from "@/pages/TimeOff";
import Schedule from "@/pages/Schedule";
import Chat from "@/pages/Chat";
import ChatThread from "@/pages/ChatThread";
import Celebrations from "@/pages/Celebrations";
import More from "@/pages/More";
import Profile from "@/pages/Profile";
import AdminDashboard from "@/pages/more/AdminDashboard";
import Directory from "@/pages/more/Directory";
import Roles from "@/pages/more/Roles";
import Invitations from "@/pages/more/Invitations";
import Location from "@/pages/more/Location";
import Achievements from "@/pages/more/Achievements";
import HospitalRules from "@/pages/more/HospitalRules";

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center" style={{ background: "var(--surface)" }}>
      <Loader2 className="animate-spin" size={32} color="var(--teal)" />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return <Navigate to={user ? "/huddle" : "/login"} replace />;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<Protected><AppLayout /></Protected>}>
              <Route path="/huddle" element={<Huddle />} />
              <Route path="/timeoff" element={<TimeOff />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:id" element={<ChatThread />} />
              <Route path="/celebrations/:type" element={<Celebrations />} />
              <Route path="/more" element={<More />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/more/admin" element={<AdminDashboard />} />
              <Route path="/more/directory" element={<Directory />} />
              <Route path="/more/roles" element={<Roles />} />
              <Route path="/more/invitations" element={<Invitations />} />
              <Route path="/more/location" element={<Location />} />
              <Route path="/more/achievements" element={<Achievements />} />
              <Route path="/more/knowledge/hospital_rules" element={<HospitalRules />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
