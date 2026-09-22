import { Routes, Route } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import EventPublic from "@/pages/EventPublic";
import Gallery from "@/pages/Gallery";
import ProjectDetail from "@/pages/ProjectDetail";
import Verify from "@/pages/Verify";
import EmbedGallery from "@/pages/EmbedGallery";
import ParticipantWorkspace from "@/pages/ParticipantWorkspace";
import JudgePortal from "@/pages/JudgePortal";
import OrganizerDashboard from "@/pages/OrganizerDashboard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "sonner";

/** Signed-in gate: renders the auth page instead of protected content. */
function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="font-mono text-sm text-muted-foreground animate-pulse">
          establishing session…
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
          <Route path="/e/:slug" element={<EventPublic />} />
          <Route path="/gallery/:slug" element={<Gallery />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:uuid" element={<Verify />} />
          <Route
            path="/workspace"
            element={
              <Protected>
                <ParticipantWorkspace />
              </Protected>
            }
          />
          <Route
            path="/judge"
            element={
              <Protected>
                <JudgePortal />
              </Protected>
            }
          />
          <Route
            path="/organizer"
            element={
              <Protected>
                <OrganizerDashboard />
              </Protected>
            }
          />
          <Route path="*" element={<Landing />} />
        </Route>
        <Route path="/embed/gallery/:slug" element={<EmbedGallery />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
