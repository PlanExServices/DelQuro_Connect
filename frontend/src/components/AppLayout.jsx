import { useEffect, useState } from "react";
import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Users, Clipboard, Calendar, Settings, MessageSquare } from "lucide-react";
import { Logo } from "@/components/Logo";
import { CampusBrand } from "@/components/CampusBrand";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useCampus } from "@/context/CampusContext";
import { api } from "@/lib/api";

// Desktop sidebar: full 5 destinations for parity with the original web app
const DESKTOP_NAV = [
  { to: "/huddle", label: "Huddle", icon: Users },
  { to: "/timeoff", label: "Time Off", icon: Clipboard },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/more", label: "Tools & Settings", icon: Settings },
];

// Mobile 4-tab navigation keeps Chat directly accessible.
const MOBILE_NAV = [
  { to: "/huddle", label: "Huddle", icon: Users },
  { to: "/timeoff", label: "Time Off", icon: Clipboard },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/chat", label: "Chat", icon: MessageSquare },
];

function SideItem({ to, label, icon: Icon, badge = 0 }) {
  return (
    <NavLink
      to={to}
      data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
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
          {badge > 0 && <span className="ml-auto rounded-full px-2 py-0.5 text-xs text-white" style={{ background: "var(--burgundy)" }} aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const { campus } = useCampus();
  const navigate = useNavigate();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => api.get("/chats").then(({ data }) => {
      if (active) setUnread(data.reduce((sum, chat) => sum + (chat.unread_count || 0), 0));
    }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [loc.pathname, user?.id]);

  const toolsActive = loc.pathname.startsWith("/more") || loc.pathname === "/profile";

  return (
    <div className={`min-h-screen ${user?.preferences?.compact_mode ? "compact-mode" : ""}`} style={{ background: "var(--surface)" }}>
      {/* Top header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-16 border-b bg-[rgba(234,243,242,0.85)]"
        style={{ borderColor: "var(--divider)", backdropFilter: "blur(12px)" }}
      >
        <button onClick={() => navigate("/huddle")} aria-label={`Go to Huddle${campus ? ` at ${campus.name}` : ""}`} data-testid="header-logo" className="min-w-0">
          {campus ? <CampusBrand campus={campus} compact /> : <Logo size={34} />}
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/more")} aria-label="Open tools and settings" aria-current={toolsActive ? "page" : undefined} className="grid lg:hidden place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: toolsActive ? "var(--brand-tertiary)" : "var(--card)" }} data-testid="header-tools">
            <Settings size={19} color={toolsActive ? "var(--teal-dark)" : "var(--brand)"} />
          </button>
          <button onClick={() => navigate("/chat")} aria-label={`Open chat${unread ? `, ${unread} unread messages` : ""}`} className="hidden lg:grid place-items-center rounded-full relative" style={{ width: 40, height: 40, background: "var(--card)" }} data-testid="header-chat">
            <MessageSquare size={18} color="var(--brand)" />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full px-1 grid place-items-center text-[11px] text-white font-semibold" style={{ background: "var(--burgundy)" }}>{unread > 99 ? "99+" : unread}</span>}
          </button>
          <button onClick={() => navigate("/profile")} aria-label="Open profile" data-testid="header-avatar">
            <Avatar initials={user?.initials} size={40} teal />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl flex gap-6 px-4 sm:px-6 py-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col gap-1 w-60 shrink-0 sticky top-24 self-start">
          {DESKTOP_NAV.map((n) => <SideItem key={n.to} {...n} badge={n.to === "/chat" ? unread : 0} />)}
          <div className="mt-4 px-4 py-4 rounded-2xl" style={{ background: "var(--card)" }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Signed in</p>
            <p className="font-display text-[15px] truncate" style={{ color: "var(--brand)" }}>{user?.name}</p>
            <p className="text-xs capitalize" style={{ color: "var(--teal-dark)" }}>{user?.role}</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-24 lg:pb-0" key={loc.pathname}>
          <Outlet />
        </main>
      </div>

      {/* Bottom navigation for the four main mobile destinations */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around items-center h-16 border-t bg-[rgba(255,255,255,0.95)]" style={{ borderColor: "var(--divider)", backdropFilter: "blur(12px)" }}>
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`tab-${label.toLowerCase().replace(" ", "-")}`}
            className="flex flex-col items-center gap-0.5 flex-1 py-2"
            aria-label={to === "/chat" && unread > 0 ? `Chat, ${unread} unread messages` : undefined}
          >
            {({ isActive }) => (
              <>
                <span className="relative"><Icon size={22} color={isActive ? "var(--teal-dark)" : "var(--text-muted)"} />{to === "/chat" && unread > 0 && <span className="absolute -top-2 -right-4 min-w-5 h-5 rounded-full px-1 grid place-items-center text-[11px] text-white font-semibold" style={{ background: "var(--burgundy)" }} aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}</span>
                <span className="text-xs font-medium" style={{ color: isActive ? "var(--teal-dark)" : "var(--text-muted)" }}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
