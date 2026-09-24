import { ReactNode, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Menu, LogOut } from "lucide-react";
import { AdminSidebar, navItems } from "./AdminSidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import uvLogo from "@/assets/uv-falcon-logo.svg";

// Desktop: AdminSidebar (hidden md:flex) handles nav directly.
// Mobile (<md): the sidebar is hidden entirely — previously with
// nothing replacing it, so a phone user got zero navigation. This
// header + hamburger-triggered Sheet drawer mirrors Branch Portal's
// BranchLayout so both portals behave identically on small screens.
// Content area keeps the same max-width + centering it already had,
// now also responsive on padding (p-4 on phone up to p-8 on desktop).
export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, logout, isSuperAdmin } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AdminSidebar />
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
                UV<span className="text-primary">Active</span>
                <span className="text-xs font-body text-muted-foreground ml-2">Admin</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
              {navItems
                .filter((item) => !item.superOnly || isSuperAdmin)
                .map((item) => (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    end={item.url === "/admin"}
                    onClick={() => setNavOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-primary/10 text-primary border border-primary/20"
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                ))}
            </nav>
            {admin && (
              <div className="border-t border-sidebar-border p-2">
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  <div className="font-medium text-sidebar-foreground truncate">{admin.name}</div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
