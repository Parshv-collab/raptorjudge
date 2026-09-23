import { Component } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "./convex/_generated/api";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import RoleHome from "./pages/RoleHome";
import ParticipantDashboard from "./pages/ParticipantDashboard";
import ParticipantWorkspace from "./pages/ParticipantWorkspace";
import EventPublic from "./pages/EventPublic";
import Gallery from "./pages/Gallery";
import ProjectDetail from "./pages/ProjectDetail";
import JudgePortal from "./pages/JudgePortal";
import JudgeScore from "./pages/JudgeScore";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import OrganizerEvents from "./pages/OrganizerEvents";
import EventForm from "./pages/EventForm";
import AdminDashboard from "./pages/AdminDashboard";
import Security from "./pages/Security";
import Verify from "./pages/Verify";
import EmbedGallery from "./pages/EmbedGallery";
import { Loading } from "./components/ui";

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <div className="flex min-h-screen items-center justify-center px-5"><div className="glass-strong max-w-lg rounded-[2rem] p-8"><div className="eyebrow mb-3">RaptorJudge</div><h1 className="text-2xl font-bold">The workspace could not load.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The frontend is running, but a data service returned an error. Check the Convex backend URL and refresh.</p><pre className="mt-5 max-h-32 overflow-auto rounded-2xl bg-muted/70 p-3 text-xs text-muted-foreground">{this.state.error.message}</pre></div></div>;
    return this.props.children;
  }
}
function Protected({ children, role }: { children: React.ReactNode; role?: string }) { const { isAuthenticated, isLoading } = useConvexAuth(); const me = useQuery(api.users.me, {}); if (isLoading || (isAuthenticated && me === undefined)) return <Loading />; if (!isAuthenticated) return <Navigate to="/auth" replace />; if (role && me?.role !== role) return <Navigate to="/home" replace />; return <>{children}</>; }
export default function App() { return <AppErrorBoundary><Routes><Route element={<AppShell />}><Route path="/" element={<Landing />} /><Route path="/auth" element={<Auth />} /><Route path="/home" element={<Protected><RoleHome /></Protected>} /><Route path="/dashboard" element={<Protected><ParticipantDashboard /></Protected>} /><Route path="/workspace" element={<Protected><ParticipantWorkspace /></Protected>} /><Route path="/e/:slug" element={<EventPublic />} /><Route path="/gallery/:slug" element={<Gallery />} /><Route path="/project/:id" element={<ProjectDetail />} /><Route path="/judge" element={<Protected role="judge"><JudgePortal /></Protected>} /><Route path="/judge/score/:id" element={<Protected role="judge"><JudgeScore /></Protected>} /><Route path="/organizer" element={<Protected role="organizer"><OrganizerDashboard /></Protected>} /><Route path="/organizer/events" element={<Protected role="organizer"><OrganizerEvents /></Protected>} /><Route path="/organizer/events/new" element={<Protected role="organizer"><EventForm /></Protected>} /><Route path="/organizer/events/:slug" element={<Protected role="organizer"><OrganizerEvents /></Protected>} /><Route path="/organizer/events/:slug/edit" element={<Protected role="organizer"><EventForm /></Protected>} /><Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} /><Route path="/security" element={<Protected><Security /></Protected>} /><Route path="/verify" element={<Verify />} /><Route path="/embed/gallery/:slug" element={<EmbedGallery />} /><Route path="*" element={<Landing />} /></Route></Routes></AppErrorBoundary>; }
