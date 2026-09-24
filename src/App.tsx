import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BranchAuthGuard } from "@/components/branch/BranchAuthGuard";
import { withRouteBoundary } from "@/components/branch/RouteErrorBoundary";
import { AuthProvider } from "@/lib/auth-context";

import BranchLogin from "./pages/branch/BranchLogin";
import Dashboard from "./pages/branch/Dashboard";
import Members from "./pages/branch/Members";
import MemberDetail from "./pages/branch/MemberDetail";
import Sessions from "./pages/branch/Sessions";
import Trainers from "./pages/branch/Trainers";
import Sensors from "./pages/branch/Sensors";
import TransferRequests from "./pages/branch/TransferRequests";
import Settings from "./pages/branch/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const BoundedDashboard = withRouteBoundary(Dashboard, "Dashboard");
const BoundedMembers = withRouteBoundary(Members, "Members");
const BoundedMemberDetail = withRouteBoundary(MemberDetail, "Member Detail");
const BoundedSessions = withRouteBoundary(Sessions, "Sessions");
const BoundedTrainers = withRouteBoundary(Trainers, "Trainers");
const BoundedSensors = withRouteBoundary(Sensors, "Sensors");
const BoundedTransferRequests = withRouteBoundary(TransferRequests, "Transfer Requests");
const BoundedSettings = withRouteBoundary(Settings, "Settings");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<BranchLogin />} />

            <Route path="/" element={<BranchAuthGuard><BoundedDashboard /></BranchAuthGuard>} />
            <Route path="/members" element={<BranchAuthGuard><BoundedMembers /></BranchAuthGuard>} />
            <Route path="/members/:id" element={<BranchAuthGuard><BoundedMemberDetail /></BranchAuthGuard>} />
            <Route path="/sessions" element={<BranchAuthGuard><BoundedSessions /></BranchAuthGuard>} />
            <Route path="/trainers" element={<BranchAuthGuard><BoundedTrainers /></BranchAuthGuard>} />
            <Route path="/sensors" element={<BranchAuthGuard><BoundedSensors /></BranchAuthGuard>} />
            <Route path="/transfer-requests" element={<BranchAuthGuard><BoundedTransferRequests /></BranchAuthGuard>} />
            <Route path="/settings" element={<BranchAuthGuard><BoundedSettings /></BranchAuthGuard>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
