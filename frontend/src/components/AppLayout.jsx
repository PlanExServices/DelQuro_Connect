import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Users, Clipboard, Calendar, Zap, MessageSquare, MoreHorizontal, Bell } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";

// Desktop sidebar: full 5 destinations for parity with the original web app
const DESKTOP_NAV = [
  { to: "/huddle", label: "Huddle", icon: Users },
  { to: "/timeoff", label: "Time Off", icon: Clipboard },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

// Mobile condensed 4-tab navigation per CAH Connect spec
const MOBILE_NAV = [
  { to: "/huddle", label: "Huddle", icon: Users },
  { to: "/timeoff", label: "Time Off", icon: Clipboard },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/more", label: "Tools", icon: Zap },
];

function SideItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors duration-200 font-medium text-[15px] ${isActive ? "" : "hover:bg-[var(--surface-tertiary)]"}`
      }
      style={({ isActive }) => ({
        background: isActive ? "var(--brand-tertiary)" : "transparent",
        color: isActive ? "var(--teal)" : "var(--text-secondary)",
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={20} color={isActive ? "var(--teal)" : "var(--text-secondary)"} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  return (
    <div className="min-h-screen" style={{ background: "var(--surface)" }}>
      {/* Top header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-16 border-b bg-[rgba(234,243,242,0.85)]"
        style={{ borderColor: "var(--divider)", backdropFilter: "blur(12px)" }}
      >
        <button onClick={() => navigate("/huddle")} data-testid="header-logo">
          <Logo size={34} />
        </button>
        <div className="flex items-center gap-3">
          <button className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: "var(--card)" }} data-testid="header-bell">
            <Bell size={18} color="var(--brand)" />
          </button>
          <button onClick={() => navigate("/profile")} data-testid="header-avatar">
            <Avatar initials={user?.initials} size={40} teal />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl flex gap-6 px-4 sm:px-6 py-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col gap-1 w-60 shrink-0 sticky top-24 self-start">
          {DESKTOP_NAV.map((n) => <SideItem key={n.to} {...n} />)}
          <div className="mt-4 px-4 py-4 rounded-2xl" style={{ background: "var(--card)" }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Signed in</p>
            <p className="font-display text-[15px] truncate" style={{ color: "var(--brand)" }}>{user?.name}</p>
            <p className="text-xs capitalize" style={{ color: "var(--teal)" }}>{user?.role}</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-24 lg:pb-0" key={loc.pathname}>
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (mobile) — 4 condensed tabs per CAH Connect */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around items-center h-16 border-t bg-[rgba(255,255,255,0.95)]" style={{ borderColor: "var(--divider)", backdropFilter: "blur(12px)" }}>
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`tab-${label.toLowerCase().replace(" ", "-")}`}
            className="flex flex-col items-center gap-1 flex-1 py-2"
          >
            {({ isActive }) => (
              <>
                <Icon size={22} color={isActive ? "var(--teal)" : "var(--text-muted)"} />
                <span className="text-[10px] font-medium" style={{ color: isActive ? "var(--teal)" : "var(--text-muted)" }}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
