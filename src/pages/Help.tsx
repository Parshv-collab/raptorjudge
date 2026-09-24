import React, { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

const FAQ_ITEMS = [
  {
    q: "How do I create or join a team?",
    a: "Navigate to your Participant Workspace from the top navigation. Click 'Create Team' to generate an invite code, or enter an existing invite code to join a team.",
  },
  {
    q: "Can I edit my project submission after submitting?",
    a: "You can save drafts freely. Once submitted, you can click 'Withdraw to Edit' at any time before the exact submission deadline.",
  },
  {
    q: "How does score normalization work?",
    a: "RaptorJudge uses Z-score normalization and Bradley-Terry pairwise models to adjust judge scores for calibration differences across judges.",
  },
  {
    q: "How do I verify a certificate?",
    a: "Go to the Verify page from the top or footer navigation, paste the certificate UUID and HMAC signature, and click Verify.",
  },
];

export default function Help() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Support & FAQ
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Help Center
        </h1>
      </div>

      <GlassCard className="p-8">
        <h2 className="text-base font-bold text-[#1d1d1f] mb-4">Frequently Asked Questions</h2>

        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="p-4 rounded-input bg-white/60 border border-white shadow-sm cursor-pointer transition-all"
                onClick={() => setOpenFaq(isOpen ? null : idx)}
              >
                <div className="flex justify-between items-center font-bold text-xs text-[#1d1d1f]">
                  <span>{item.q}</span>
                  <span className="text-[#ff0055] text-base">{isOpen ? "−" : "+"}</span>
                </div>
                {isOpen && (
                  <p className="text-xs text-[#6e6e73] mt-2 pt-2 border-t border-black/5 leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-black/5 text-center flex flex-col items-center gap-2">
          <p className="text-xs text-[#6e6e73]">Still need assistance?</p>
          <a href="mailto:support@raptorjudge.local">
            <span className="text-xs font-bold text-[#ff0055] hover:underline">
              Contact Support Team →
            </span>
          </a>
        </div>
      </GlassCard>
    </div>
  );
}
