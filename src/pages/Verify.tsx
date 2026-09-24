import React, { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function Verify() {
  const { uuid: uuidParam } = useParams<{ uuid?: string }>();
  const [searchParams] = useSearchParams();
  const sigParam = searchParams.get("signature") ?? "";
  const isJudge = window.location.pathname.includes("/judge/");

  const [uuid, setUuid] = useState(uuidParam ?? "");
  const [signature, setSignature] = useState(sigParam);
  const [submitted, setSubmitted] = useState({ uuid: uuidParam ?? "", signature: sigParam });

  const certResult = useQuery(
    api.certificates.verify,
    !isJudge && submitted.uuid && submitted.signature
      ? { certUuid: submitted.uuid.trim(), signature: submitted.signature.trim() }
      : "skip"
  );

  const judgeName = searchParams.get("judgeName") ?? "";
  const eventName = searchParams.get("eventName") ?? "";
  const projectsScored = searchParams.get("projectsScored") ?? "0";
  const totalScores = searchParams.get("totalScores") ?? "0";
  const isJudgeValid = isJudge && Boolean(sigParam) && Boolean(uuidParam);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col gap-8">
      <div className="text-center flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center font-bold text-xl mb-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold text-[#1d1d1f]">Verify Certificate</h1>
        <p className="text-xs text-[#6e6e73] max-w-md leading-relaxed">
          Verify the authenticity of a RaptorJudge cryptographic certificate using the UUID and HMAC signature.
        </p>
      </div>

      <GlassCard className="p-8">
        <div className="flex flex-col gap-4">
          <Input
            label="Certificate UUID"
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
            placeholder="e.g. 9f2c..."
          />

          <Input
            label="Signature (HMAC Hex)"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="sha256-hmac signature string"
          />

          <Button
            variant="primary"
            size="md"
            onClick={() => setSubmitted({ uuid, signature })}
            className="mt-2"
          >
            Verify Certificate
          </Button>
        </div>
      </GlassCard>

      {isJudge && isJudgeValid && (
        <Alert variant="success" title="Judge Record Verified">
          <div className="flex flex-col gap-1.5 mt-2 text-xs">
            <div>
              <span className="font-semibold text-[#1d1d1f]">Judge: </span>
              {judgeName || "Verified Judge"}
            </div>
            <div>
              <span className="font-semibold text-[#1d1d1f]">Event: </span>
              {eventName || "RaptorJudge Event"}
            </div>
            <div>
              <span className="font-semibold text-[#1d1d1f]">Projects Scored: </span>
              {projectsScored}
            </div>
            <div>
              <span className="font-semibold text-[#1d1d1f]">Total Scores Submitted: </span>
              {totalScores}
            </div>
          </div>
        </Alert>
      )}

      {!isJudge && certResult && (
        <div>
          {certResult.valid ? (
            <Alert variant="success" title="Certificate Verified">
              <div className="flex flex-col gap-1.5 mt-2 text-xs">
                <div>
                  <span className="font-semibold text-[#1d1d1f]">Recipient: </span>
                  {certResult.certificate?.recipientName}
                </div>
                <div>
                  <span className="font-semibold text-[#1d1d1f]">Type: </span>
                  <span className="uppercase">{certResult.certificate?.certType}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#1d1d1f]">Title: </span>
                  {certResult.certificate?.title}
                </div>
                <div>
                  <span className="font-semibold text-[#1d1d1f]">Issued: </span>
                  {new Date(certResult.certificate?.issuedAt ?? 0).toLocaleDateString()}
                </div>
              </div>
            </Alert>
          ) : (
            <Alert variant="error" title="Certificate Invalid">
              {certResult.reason || "The provided certificate UUID or signature does not match records."}
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
