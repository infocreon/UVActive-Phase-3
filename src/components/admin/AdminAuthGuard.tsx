import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

interface AdminAuthGuardProps {
  children: ReactNode;
  /** Restrict this route to super_admin only (e.g. Admin Users page). */
  requireSuperAdmin?: boolean;
}

export function AdminAuthGuard({ children, requireSuperAdmin }: AdminAuthGuardProps) {
  const { admin } = useAuth();

  if (!admin) return <Navigate to="/admin/login" replace />;
  if (requireSuperAdmin && admin.role !== "super_admin") return <Navigate to="/admin" replace />;

  return <>{children}</>;
}
