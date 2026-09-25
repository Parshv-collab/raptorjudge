import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

const FAQ_ITEMS = [
  {
    q: "How do I create or join a team?",
    a: "Open your team workspace from the sidebar. Click 'Create team' to generate an invite code, or enter an existing invite code to join a team.",
  },
  {
    q: "Can I edit my project submission after submitting?",
    a: "You can save drafts freely. Once submitted, you can withdraw to edit at any time before the exact submission deadline.",
  },
  {
    q: "How does score normalization work?",
    a: "RaptorJudge uses per-judge z-score normalization and Bradley-Terry pairwise models to adjust judge scores for calibration differences across judges.",
  },
  {
    q: "How do I verify a certificate?",
    a: "Go to the Verify page, paste the certificate UUID and HMAC signature, and click Verify. Verification is public and does not require an account.",
  },
];

export default function Help() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <PageHeader title="Help center" description="Support and frequently asked questions." bordered={false} />

      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, idx) => {
          const isOpen = openFaq === idx;
          return (
            <div key={idx} className="bg-surface-1 border border-line rounded-card">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenFaq(isOpen ? null : idx)}
                className="w-full flex justify-between items-center px-5 h-14 text-left text-sm font-medium text-primary"
              >
                <span>{item.q}</span>
                <span className="text-accent text-lg leading-none" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <p className="px-5 pb-5 text-[13px] text-secondary leading-relaxed border-t border-line pt-4">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center flex flex-col items-center gap-2 pt-4">
        <p className="text-[13px] text-secondary">Still need assistance?</p>
        <a href="mailto:support@raptorjudge.local" className="text-sm text-accent hover:text-accent-hover">
          Contact support →
        </a>
      </div>
    </div>
  );
}
