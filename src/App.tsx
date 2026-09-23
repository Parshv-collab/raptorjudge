import React from "react";
import { Routes, Route } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
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
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "sonner";

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-xs font-semibold text-[#6e6e73] animate-pulse">
          Establishing session...
        </div>
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
        <Route element={<AppShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<Terms />} />
          <Route path="/e/:slug" element={<EventPublic />} />
          <Route path="/gallery/:slug" element={<Gallery />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/home" element={<Protected><RoleHome /></Protected>} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:uuid" element={<Verify />} />
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
          <Route path="/profile" element={<Protected><Security /></Protected>} />
          <Route path="/settings" element={<Protected><Security /></Protected>} />
          <Route path="/security" element={<Protected><Security /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/embed/gallery/:slug" element={<EmbedGallery />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
