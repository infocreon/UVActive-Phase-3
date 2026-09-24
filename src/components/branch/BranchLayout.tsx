import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { BranchSidebar, NAV } from "./BranchSidebar";
import { SuspendedScreen } from "./SuspendedScreen";
import { useGymSuspended } from "@/lib/use-gym-suspended";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Menu, LogOut } from "lucide-react";
import uvLogo from "@/assets/uv-falcon-logo.svg";

// No manager/gym name repeated on every single tab anymore — that's
// redundant once the Dashboard greets the manager by name, and each
// page already carries its own heading. Log out now lives at the
// bottom of the sidebar (see BranchSidebar) for desktop.
//
// The sidebar itself is desktop-only (hidden below `md`) — previously
// the mobile bar below carried nothing but a logout button, so a
// phone user had zero way to get from one page to another. This now
// adds a hamburger-triggered Sheet drawer with the same nav list,
// mirroring the Admin Panel's AdminLayout/AdminSidebar split so both
// portals behave identically on small screens.
export function BranchLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const suspended = useGymSuspended();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-background">
      <BranchSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 shrink-0 border-b border-border flex items-center justify-between px-3">
          <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </header>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <SheetHeader className="h-16 flex-row items-center px-4 gap-2 space-y-0 border-b border-sidebar-border">
              <img src={uvLogo} alt="UV Active" className="h-8 w-8 rounded-md object-cover shrink-0" />
              <SheetTitle className="font-heading text-lg font-bold">
                UV Active <span className="text-primary">Branch</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-sidebar-border p-2">
              <button
                onClick={() => logout()}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Log out
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {suspended ? (
          <SuspendedScreen />
        ) : (
          <main className="flex-1 overflow-auto">
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}
