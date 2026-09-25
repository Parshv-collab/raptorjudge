import { GlassCard } from "@/components/ui/GlassCard";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-[#1d1d1f]">Terms of Service</h1>
        <p className="text-xs text-[#6e6e73] mt-1">Last updated: March 2026</p>
      </div>

      <GlassCard className="p-8 space-y-6 text-sm text-[#1d1d1f] leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">1. Acceptance of Terms</h2>
          <p className="text-xs text-[#6e6e73]">
            By accessing or using RaptorJudge, you agree to be bound by these Terms of Service. RaptorJudge is an open-source, self-hostable hackathon submission and judging platform designed to evaluate submissions fairly using rubric scoring, Bradley-Terry pairwise rankings, and score normalization.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">2. Code of Conduct & Submissions</h2>
          <p className="text-xs text-[#6e6e73]">
            All participants, judges, organizers, and administrators must maintain integrity and respect. Submissions must represent original work created during the hackathon period specified by event organizers. Any attempt to tamper with judging scores, submit plagiarized work, or manipulate community voting will result in disqualification.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">3. Judging Integrity</h2>
          <p className="text-xs text-[#6e6e73]">
            Judges must score assigned projects impartially based on rubric criteria. Normalization and pairwise algorithms process evaluation scores to minimize calibration bias. Final results published by organizers are binding for certificate issuance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[#ff0055]">4. Self-Hosting & Licensing</h2>
          <p className="text-xs text-[#6e6e73]">
            RaptorJudge software is provided under open-source license terms. Self-hosted instances operate independently, and local operators are responsible for compliance with regional data processing standards.
          </p>
        </section>
      </GlassCard>
    </div>
  );
}
