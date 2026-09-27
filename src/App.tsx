import React from "react";
import { Routes, Route } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
import TeamChat from "@/pages/TeamChat";
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
import AdminWinnerOverrides from "@/pages/AdminWinnerOverrides";
import AdminHelp from "@/pages/AdminHelp";
import InviteAccept from "@/pages/InviteAccept";
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import Results from "@/pages/Results";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";

import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { roleHomePath } from "@/lib/roles";

/**
 * `/results` without a slug: bounce to this participant's first enrolled
 * event's results page (issue 23.1). Unknown events fall back to NotFound via
 * the Results page's own empty state.
 */
function ResultsIndexRedirect() {
  const enrolled = useQuery(api.events.enrolled, {});
  if (enrolled === undefined) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }
  const first = enrolled[0];
  return <Navigate to={first ? `/results/${first.slug}` : "/dashboard"} replace />;
}

function MinimalLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-canvas text-primary">
      <header className="sticky top-0 z-40 w-full bg-canvas/90 backdrop-blur border-b border-line">
        <div className="max-w-content mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5"
          >
            <span className="w-7 h-7 rounded-btn bg-accent text-white flex items-center justify-center text-[13px] font-bold">
              R
            </span>
            <span className="wordmark text-[17px]">
              Raptor<span className="text-accent">Judge</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-content mx-auto px-5 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line py-6 text-center text-[13px] text-muted">
        © 2026 RaptorJudge
      </footer>
    </div>
  );
}

/**
 * Auth gate for authenticated routes.
 *
 * Signed-out visitors are redirected to `/auth?returnTo=<path>` rather than
 * having the sign-in form rendered in place, so the destination they asked for
 * survives the round-trip and they never land back on the public landing page.
 * A short settle delay avoids bouncing a signed-in user whose token is still
 * being refreshed.
 */
function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
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
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
}

/**
 * `/` is the marketing page — but only for visitors who are signed out.
 *
 * An authenticated user is sent straight to their own console, so the landing
 * page can never appear "inside" a session (clicking the wordmark used to dump
 * an organizer back on the hero with a live session).
 */
function LandingGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isLoading || !isAuthenticated ? "skip" : {});

  if (isLoading || (isAuthenticated && me === undefined)) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to={roleHomePath(me?.role) ?? "/home"} replace />;
  }
  return <Landing />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<MinimalLayout />}>
          <Route path="/auth" element={<Auth />} />
          <Route path="/invite/:token" element={<InviteAccept />} />
        </Route>

        <Route element={<AppShell />}>
          {/* Public — no session required */}
          <Route path="/" element={<LandingGate />} />
          <Route path="/events" element={<Browse />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<Help />} />
          <Route path="/e/:slug" element={<EventPublic />} />
          <Route path="/gallery/:slug" element={<Gallery />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:uuid" element={<Verify />} />
          <Route path="/verify/judge/:uuid" element={<Verify />} />

          {/* Any signed-in role */}
          <Route path="/home" element={<Protected><RoleHome /></Protected>} />
          <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />

          {/* Participant */}
          <Route
            path="/dashboard"
            element={<ProtectedRoute requiredRole="participant"><ParticipantDashboard /></ProtectedRoute>}
          />
          <Route
            path="/workspace"
            element={<ProtectedRoute requiredRole="participant"><ParticipantWorkspace /></ProtectedRoute>}
          />
          <Route
            path="/workspace/chat"
            element={<ProtectedRoute requiredRole="participant"><TeamChat /></ProtectedRoute>}
          />
          {/* Issue 23.2: participant results — podium + full ranking per event. */}
          <Route
            path="/results/:slug"
            element={<ProtectedRoute requiredRole="participant"><Results /></ProtectedRoute>}
          />
          <Route
            path="/results"
            element={<ProtectedRoute requiredRole="participant"><ResultsIndexRedirect /></ProtectedRoute>}
          />

          {/* Judge */}
          <Route path="/judge" element={<ProtectedRoute requiredRole="judge"><JudgePortal /></ProtectedRoute>} />
          <Route
            path="/judge/score/:id"
            element={<ProtectedRoute requiredRole="judge"><JudgeScore /></ProtectedRoute>}
          />
          <Route
            path="/judge/pairwise"
            element={<ProtectedRoute requiredRole="judge"><JudgePairwise /></ProtectedRoute>}
          />

          {/* Organizer (admins may operate any organizer surface) */}
          <Route
            path="/organizer"
            element={<ProtectedRoute requiredRole={["organizer", "admin"]}><OrganizerDashboard /></ProtectedRoute>}
          />
          <Route
            path="/organizer/events"
            element={<ProtectedRoute requiredRole={["organizer", "admin"]}><OrganizerEvents /></ProtectedRoute>}
          />
          <Route
            path="/organizer/events/new"
            element={<ProtectedRoute requiredRole={["organizer", "admin"]}><EventForm /></ProtectedRoute>}
          />
          <Route
            path="/organizer/events/:slug"
            element={<ProtectedRoute requiredRole={["organizer", "admin"]}><OrganizerEventManagement /></ProtectedRoute>}
          />
          <Route
            path="/organizer/events/:slug/edit"
            element={<ProtectedRoute requiredRole={["organizer", "admin"]}><EventForm edit /></ProtectedRoute>}
          />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute requiredRole="admin"><AdminEvents /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute requiredRole="admin"><AdminAudit /></ProtectedRoute>} />
          <Route path="/admin/invites" element={<ProtectedRoute requiredRole="admin"><AdminInvites /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
          <Route path="/admin/judging" element={<ProtectedRoute requiredRole="admin"><AdminJudging /></ProtectedRoute>} />
          <Route
            path="/admin/winner-overrides"
            element={<ProtectedRoute requiredRole="admin"><AdminWinnerOverrides /></ProtectedRoute>}
          />
          {/* Issue 27: admin CRUD over the public help center. */}
          <Route
            path="/admin/help"
            element={<ProtectedRoute requiredRole="admin"><AdminHelp /></ProtectedRoute>}
          />

          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/embed/gallery/:slug" element={<EmbedGallery />} />
      </Routes>
    </>
  );
}
