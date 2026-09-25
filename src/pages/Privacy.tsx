import { GlassCard } from "@/components/ui/GlassCard";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-[#1d1d1f]">Privacy Policy</h1>
        <p className="text-xs text-[#6e6e73] mt-1">Last updated: March 2026</p>
      </div>

      <GlassCard className="p-8 space-y-6 text-sm text-[#1d1d1f] leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">1. Offline-First Privacy Guarantee</h2>
          <p className="text-xs text-[#6e6e73]">
            RaptorJudge is engineered for self-hosted, privacy-first operations. The platform contains zero third-party telemetry, no analytics trackers, and no external font or script CDN dependencies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">2. Information Collected</h2>
          <p className="text-xs text-[#6e6e73]">
            We process minimal user account data necessary for hackathon operation: email address, display name, user role, and optional profile avatar. Authentication tokens are stored strictly in session memory (`sessionStorage`) and cleared when the browser closes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">3. Audit Trail & Logging</h2>
          <p className="text-xs text-[#6e6e73]">
            Administrative and organizer actions (such as score submission, role modifications, and certificate issuance) are stored in an append-only cryptographic audit trail to ensure judging transparency and auditability.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">4. Security & Data Storage</h2>
          <p className="text-xs text-[#6e6e73]">
            Passwords and two-factor authentication secrets are securely hashed and stored within the self-hosted Convex/PostgreSQL database.
          </p>
        </section>
      </GlassCard>
    </div>
  );
}
