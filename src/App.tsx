import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminAuthGuard } from "@/components/admin/AdminAuthGuard";
import { withRouteBoundary } from "@/components/admin/RouteErrorBoundary";
import { AuthProvider } from "@/lib/auth-context";

import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Gyms from "./pages/admin/Gyms";
import Members from "./pages/admin/Members";
import Trainers from "./pages/admin/Trainers";
import TrainerDetail from "./pages/admin/TrainerDetail";
import Sessions from "./pages/admin/Sessions";
import Sensors from "./pages/admin/Sensors";
import SessionDetail from "./pages/admin/SessionDetail";
import SessionAthleteDetail from "./pages/admin/SessionAthleteDetail";
import AdminUsers from "./pages/admin/AdminUsers";
import AuditLog from "./pages/admin/AuditLog";
import AdminSettings from "./pages/admin/AdminSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const BoundedAdminDashboard = withRouteBoundary(AdminDashboard, "Dashboard");
const BoundedGyms = withRouteBoundary(Gyms, "Gyms");
const BoundedMembers = withRouteBoundary(Members, "Members");
const BoundedTrainers = withRouteBoundary(Trainers, "Trainers");
const BoundedTrainerDetail = withRouteBoundary(TrainerDetail, "Trainer Detail");
const BoundedSessions = withRouteBoundary(Sessions, "Sessions");
const BoundedSensors = withRouteBoundary(Sensors, "Sensors");
const BoundedSessionDetail = withRouteBoundary(SessionDetail, "Session Detail");
const BoundedSessionAthleteDetail = withRouteBoundary(SessionAthleteDetail, "Session Athlete Detail");
const BoundedAdminUsers = withRouteBoundary(AdminUsers, "Admin Users");
const BoundedAuditLog = withRouteBoundary(AuditLog, "Audit Log");
const BoundedAdminSettings = withRouteBoundary(AdminSettings, "Settings");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            <Route path="/admin" element={<AdminAuthGuard><BoundedAdminDashboard /></AdminAuthGuard>} />
            <Route path="/admin/gyms" element={<AdminAuthGuard><BoundedGyms /></AdminAuthGuard>} />
            <Route path="/admin/members" element={<AdminAuthGuard><BoundedMembers /></AdminAuthGuard>} />
            <Route path="/admin/trainers" element={<AdminAuthGuard><BoundedTrainers /></AdminAuthGuard>} />
            <Route path="/admin/trainers/:id" element={<AdminAuthGuard><BoundedTrainerDetail /></AdminAuthGuard>} />
            <Route path="/admin/sessions" element={<AdminAuthGuard><BoundedSessions /></AdminAuthGuard>} />
            <Route path="/admin/sensors" element={<AdminAuthGuard><BoundedSensors /></AdminAuthGuard>} />
            <Route path="/admin/sessions/:id" element={<AdminAuthGuard><BoundedSessionDetail /></AdminAuthGuard>} />
            <Route path="/admin/sessions/:id/athlete/:memberId" element={<AdminAuthGuard><BoundedSessionAthleteDetail /></AdminAuthGuard>} />
            <Route path="/admin/admins" element={<AdminAuthGuard requireSuperAdmin><BoundedAdminUsers /></AdminAuthGuard>} />
            <Route path="/admin/audit-log" element={<AdminAuthGuard requireSuperAdmin><BoundedAuditLog /></AdminAuthGuard>} />
            <Route path="/admin/settings" element={<AdminAuthGuard><BoundedAdminSettings /></AdminAuthGuard>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
