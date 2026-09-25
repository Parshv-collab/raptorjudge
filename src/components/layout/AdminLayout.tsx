import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Award,
  Mail,
  Settings,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";

interface AdminLayoutProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: "Overview", path: "/admin", icon: LayoutDashboard },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Events", path: "/admin/events", icon: Calendar },
  { label: "Judging", path: "/admin/judging", icon: Award },
  { label: "Invites", path: "/admin/invites", icon: Mail },
  { label: "Settings", path: "/admin/settings", icon: Settings },
  { label: "Audit Log", path: "/admin/audit", icon: ShieldCheck },
];

export function AdminLayout({ title, description, action, children }: AdminLayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#0f0f12] text-[#f5f5f7] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#13131a] border-b border-white/10">
        <div className="flex items-center gap-2 font-black tracking-tight text-lg text-white">
          <span className="w-8 h-8 rounded-lg bg-[#ff0055] text-white flex items-center justify-center text-sm font-black">
            R
          </span>
          <span>ADMIN TERMINAL</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-white/80 hover:text-white rounded-lg bg-white/5 border border-white/10"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Left Sidebar (240px wide) */}
      <aside
        className={`${
          mobileMenuOpen ? "block" : "hidden"
        } md:block w-full md:w-[240px] shrink-0 bg-[#13131a] border-r border-white/10 flex flex-col justify-between py-6 px-3 z-30`}
      >
        <div className="space-y-6">
          {/* Brand Logo */}
          <div className="hidden md:flex items-center gap-2 px-3">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff0055] to-[#ff5588] text-white flex items-center justify-center font-black text-base shadow-md shadow-[#ff0055]/30">
              R
            </span>
            <span className="font-extrabold tracking-tight text-base text-white">
              ADMIN CONTROL
            </span>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === "/admin"
                  ? location.pathname === "/admin"
                  : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all duration-150 ${
                    isActive
                      ? "bg-white/10 text-white font-bold border-l-4 border-[#ff0055] shadow-sm"
                      : "text-[#8a8a92] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#ff0055]" : "text-[#8a8a92]"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info */}
        <div className="px-3 pt-6 border-t border-white/5 text-[11px] text-[#8a8a92]">
          <p className="font-semibold text-white/80">RaptorJudge Admin</p>
          <p className="text-[10px]">v2.6 System Active</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h1 className="text-2xl font-semibold text-[#f5f5f7] tracking-tight">{title}</h1>
            <p className="text-xs text-[#8a8a92] mt-1">{description}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {/* Content Children */}
        <div>{children}</div>
      </main>
    </div>
  );
}
