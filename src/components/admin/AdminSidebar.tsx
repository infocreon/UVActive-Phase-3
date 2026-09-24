import {
  LayoutDashboard,
  Building2,
  Users,
  Dumbbell,
  CalendarClock,
  Radio,
  ShieldCheck,
  ScrollText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Cog,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import uvLogo from "@/assets/uv-falcon-logo.svg";

export const navItems = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard, superOnly: false },
  { title: "Gyms", url: "/admin/gyms", icon: Building2, superOnly: false },
  { title: "Members", url: "/admin/members", icon: Users, superOnly: false },
  { title: "Trainers", url: "/admin/trainers", icon: Dumbbell, superOnly: false },
  { title: "Sessions", url: "/admin/sessions", icon: CalendarClock, superOnly: false },
  { title: "Sensors", url: "/admin/sensors", icon: Radio, superOnly: false },
  { title: "Admin Users", url: "/admin/admins", icon: ShieldCheck, superOnly: true },
  { title: "Audit Log", url: "/admin/audit-log", icon: ScrollText, superOnly: true },
  { title: "Settings", url: "/admin/settings", icon: Cog, superOnly: false },
];

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { admin, logout, isSuperAdmin } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <aside
      className={cn(
        // Previously always rendered — a phone got the full desktop
        // sidebar squeezed into its viewport, with no mobile nav at
        // all. Hidden below `md` now; AdminLayout supplies an
        // equivalent mobile header + drawer (mirrors Branch Portal's
        // BranchLayout/BranchSidebar split).
        "hidden md:flex h-screen sticky top-0 flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border gap-2">
        <img src={uvLogo} alt="UV Active" className="h-8 w-8 rounded-md object-cover shrink-0" />
        {!collapsed && (
          <span className="font-heading text-lg font-bold text-foreground tracking-tight">
            UV<span className="text-primary">Active</span>
            <span className="text-xs font-body text-muted-foreground ml-2">Admin</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems
          .filter((item) => !item.superOnly || isSuperAdmin)
          .map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/admin"}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                collapsed && "justify-center px-2",
              )}
              activeClassName="bg-primary/10 text-primary border border-primary/20"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          ))}
      </nav>

      {/* Account + Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        {!collapsed && admin && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-sidebar-foreground truncate">{admin.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  admin.role === "super_admin" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground",
                )}
              >
                {admin.role === "super_admin" ? "Super Admin" : "Support"}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors",
            collapsed && "justify-center px-2",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
