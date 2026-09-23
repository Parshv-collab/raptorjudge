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
import JudgeScore from "@/pages/JudgeScore";
import OrganizerDashboard from "@/pages/OrganizerDashboard";
import Security from "@/pages/Security";
import RoleHome from "@/pages/RoleHome";
import { OrganizerEvents, OrganizerEventManagement } from "@/pages/OrganizerEvents";
import EventForm from "@/pages/EventForm";
import AdminDashboard from "@/pages/AdminDashboard";
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "sonner";
function Protected({ children }: { children: React.ReactNode }) { const { isAuthenticated, isLoading } = useConvexAuth(); if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="font-mono text-sm text-muted-foreground animate-pulse">establishing session…</div></div>; if (!isAuthenticated) return <Auth />; return <>{children}</>; }
  export default function App(){return <ThemeProvider><Routes><Route element={<AppShell />}><Route path="/" element={<Landing/>}/><Route path="/auth" element={<Auth/>}/><Route path="/e/:slug" element={<EventPublic/>}/><Route path="/gallery/:slug" element={<Gallery/>}/><Route path="/project/:id" element={<ProjectDetail/>}/><Route path="/home" element={<Protected><RoleHome/></Protected>}/><Route path="/verify" element={<Verify/>}/><Route path="/verify/:uuid" element={<Verify/>}/><Route path="/dashboard" element={<Protected><ParticipantDashboard/></Protected>}/><Route path="/workspace" element={<Protected><ParticipantWorkspace/></Protected>}/><Route path="/judge" element={<Protected><JudgePortal/></Protected>}/><Route path="/judge/score/:id" element={<Protected><JudgeScore/></Protected>}/><Route path="/organizer" element={<Protected><OrganizerDashboard/></Protected>}/><Route path="/organizer/events" element={<Protected><OrganizerEvents/></Protected>}/><Route path="/organizer/events/new" element={<Protected><EventForm/></Protected>}/><Route path="/organizer/events/:slug" element={<Protected><OrganizerEventManagement/></Protected>}/><Route path="/organizer/events/:slug/edit" element={<Protected><EventForm edit/></Protected>}/><Route path="/admin" element={<Protected><AdminDashboard/></Protected>}/><Route path="/security" element={<Protected><Security/></Protected>}/><Route path="*" element={<Landing/>}/></Route><Route path="/embed/gallery/:slug" element={<EmbedGallery/>}/></Routes><Toaster richColors position="top-right"/></ThemeProvider>}
