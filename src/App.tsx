import React from "react";
import { Routes, Route } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Browse from "@/pages/Browse";
import Search from "@/pages/Search";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";
import NotFound from "@/pages/NotFound";
import EventPublic from "@/pages/EventPublic";
import Gallery from "@/pages/Gallery";
import ProjectDetail from "@/pages/ProjectDetail";
import Verify from "@/pages/Verify";
import EmbedGallery from "@/pages/EmbedGallery";
import ParticipantWorkspace from "@/pages/ParticipantWorkspace";
import JudgePortal from "@/pages/JudgePortal";
import JudgeScore from "@/pages/JudgeScore";
import JudgePairwise from "@/pages/JudgePairwise";
import OrganizerDashboard from "@/pages/OrganizerDashboard";
import Security from "@/pages/Security";
import RoleHome from "@/pages/RoleHome";
import { OrganizerEvents } from "@/pages/OrganizerEvents";
import { OrganizerEventManage as OrganizerEventManagement } from "@/pages/OrganizerEventManage";
import EventForm from "@/pages/EventForm";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminEvents from "@/pages/AdminEvents";
import AdminAudit from "@/pages/AdminAudit";
import AdminInvites from "@/pages/AdminInvites";
import AdminSettings from "@/pages/AdminSettings";
import AdminJudging from "@/pages/AdminJudging";
import InviteAccept from "@/pages/InviteAccept";
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import { Link, Outlet } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { SkeletonCard } from "@/components/ui/SkeletonCard";

function MinimalLayout() {
  return (
    <div className="min-h-screen flex flex-col relative text-[#1d1d1f]">
      <div className="pastel-bg-container" aria-hidden="true">
        <div className="pastel-blob pastel-blob-1" />
        <div className="pastel-blob pastel-blob-2" />
      </div>

      <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-extrabold text-lg text-[#1d1d1f] hover:opacity-90 transition-opacity focus-ring-accent rounded-button p-1"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff0055] to-[#ff5588] text-white flex items-center justify-center font-black text-sm shadow-sm shadow-[#ff0055]/30">
              R
            </div>
            <span className="tracking-tight">
              Raptor<span className="text-[#ff0055]">Judge</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settled, setSettled] = React.useState(false);

  React.useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => setSettled(true), 100);
      return () => clearTimeout(timer);
    } else {
      setSettled(false);
    }
  }, [isAuthenticated]);

  if (isLoading || (isAuthenticated && !settled)) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }
  if (!isAuthenticated) return <Auth />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route element={<MinimalLayout />}>
          <Route path="/auth" element={<Auth />} />
          <Route path="/invite/:token" element={<InviteAccept />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/events" element={<Browse />} />
          <Route path="/search" element={<Protected><Search /></Protected>} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<Help />} />
          <Route path="/e/:slug" element={<EventPublic />} />
          <Route path="/gallery/:slug" element={<Gallery />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/home" element={<Protected><RoleHome /></Protected>} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:uuid" element={<Verify />} />
          <Route path="/verify/judge/:uuid" element={<Verify />} />
          <Route path="/dashboard" element={<Protected><ParticipantDashboard /></Protected>} />
          <Route path="/workspace" element={<Protected><ParticipantWorkspace /></Protected>} />
          <Route path="/judge" element={<Protected><JudgePortal /></Protected>} />
          <Route path="/judge/score/:id" element={<Protected><JudgeScore /></Protected>} />
          <Route path="/judge/pairwise" element={<Protected><JudgePairwise /></Protected>} />
          <Route path="/organizer" element={<Protected><OrganizerDashboard /></Protected>} />
          <Route path="/organizer/events" element={<Protected><OrganizerEvents /></Protected>} />
          <Route path="/organizer/events/new" element={<Protected><EventForm /></Protected>} />
          <Route path="/organizer/events/:slug" element={<Protected><OrganizerEventManagement /></Protected>} />
          <Route path="/organizer/events/:slug/edit" element={<Protected><EventForm edit /></Protected>} />
          <Route path="/admin" element={<Protected><AdminDashboard /></Protected>} />
          <Route path="/admin/users" element={<Protected><AdminUsers /></Protected>} />
          <Route path="/admin/events" element={<Protected><AdminEvents /></Protected>} />
          <Route path="/admin/audit" element={<Protected><AdminAudit /></Protected>} />
          <Route path="/admin/invites" element={<Protected><AdminInvites /></Protected>} />
          <Route path="/admin/settings" element={<Protected><AdminSettings /></Protected>} />
          <Route path="/admin/judging" element={<Protected><AdminJudging /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/security" element={<Protected><Security /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/embed/gallery/:slug" element={<EmbedGallery />} />
      </Routes>
    </ThemeProvider>
  );
}
