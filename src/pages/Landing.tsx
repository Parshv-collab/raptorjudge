import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

export default function Landing() {
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });

  return (
    <div className="flex flex-col gap-16 py-8">
      {/* Hero Section */}
      <section className="text-center max-w-4xl mx-auto px-4 flex flex-col items-center gap-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/60 border border-white/80 shadow-sm text-xs font-semibold text-[#1d1d1f]">
          <span className="w-2 h-2 rounded-full bg-[#ff0055] animate-pulse" />
          RaptorJudge — Open-Source Hackathon Platform
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#1d1d1f] leading-[1.1]">
          Hackathon Judging <br />
          <span className="text-[#ff0055]">Engineered for Fairness</span>
        </h1>

        <p className="text-sm sm:text-base text-[#6e6e73] max-w-2xl leading-relaxed">
          Streamline registration, submission management, rubric scoring, cross-judge score normalization, Bradley-Terry pairwise rankings, and cryptographic certificates.
        </p>

        {/* ONE Primary CTA */}
        <div className="mt-2">
          <Link to={event ? `/e/dogfood-2026` : "/auth"}>
            <Button variant="primary" size="lg" className="shadow-lg shadow-[#ff0055]/30">
              Explore the demo event →
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Row — 3 Cards Explaining Platform */}
      <section className="max-w-6xl mx-auto px-4 w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-[#1d1d1f]">Built for Modern Hackathons</h2>
          <p className="text-xs text-[#6e6e73] mt-1">Everything you need to host fair and engaging events</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard hoverEffect className="flex flex-col items-start p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center font-bold text-xl mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#1d1d1f] mb-2">Team & Submissions</h3>
            <p className="text-xs text-[#6e6e73] leading-relaxed">
              Easily form teams via invite codes, edit draft project submissions, and lock edits automatically at the submission deadline.
            </p>
          </GlassCard>

          <GlassCard hoverEffect className="flex flex-col items-start p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center font-bold text-xl mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#1d1d1f] mb-2">Calibrated Judging</h3>
            <p className="text-xs text-[#6e6e73] leading-relaxed">
              Score submissions with custom rubric criteria. Z-score normalization and Bradley-Terry algorithms eliminate harsh vs lenient judge bias.
            </p>
          </GlassCard>

          <GlassCard hoverEffect className="flex flex-col items-start p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center font-bold text-xl mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#1d1d1f] mb-2">Signed Certificates</h3>
            <p className="text-xs text-[#6e6e73] leading-relaxed">
              Automatically issue cryptographically signed HMAC certificates for winners and participants with instant public verification.
            </p>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
