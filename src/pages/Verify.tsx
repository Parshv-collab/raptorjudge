import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/** Fields present only on a successful `judging.verifyJudgeRecord` result. */
type JudgeRecordView = {
  judgeName?: string;
  eventName?: string;
  eventSlug?: string;
  projectsScored?: number;
  totalScoresSubmitted?: number;
  issuedAt?: number;
};

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

  // Judge attestation: verified against the backend, never from the URL. The
  // link carries the counts in its query string for convenience, but they are
  // only trustworthy when the HMAC over them matches the server's record.
  const judgeId = uuidParam ?? "";
  const eventIdParam = searchParams.get("eventId") ?? "";
  const judgeRecord = useQuery(
    api.judging.verifyJudgeRecord,
    isJudge && judgeId && eventIdParam && sigParam
      ? { judgeId, eventId: eventIdParam, signature: sigParam }
      : "skip"
  );
  const judgeLinkComplete = isJudge && Boolean(judgeId) && Boolean(eventIdParam) && Boolean(sigParam);
  // The success branch is the only one carrying record fields — narrow once so
  // the table below never reads a property that a failed check does not have.
  const verified = judgeRecord?.valid ? (judgeRecord as JudgeRecordView) : null;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8 py-6">
      <header className="text-center flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-btn border border-line bg-surface-1 text-accent flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-h1 text-primary">Verify certificate</h1>
        <p className="text-sm text-secondary max-w-md leading-relaxed">
          Check the authenticity of a RaptorJudge cryptographic certificate using the UUID and HMAC
          signature. Verification is public — no account required.
        </p>
      </header>

      <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-5">
        <Input label="Certificate UUID" value={uuid} onChange={(e) => setUuid(e.target.value)} placeholder="e.g. 9f2c..." />
        <Input
          label="Signature (HMAC hex)"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="sha256-hmac signature string"
        />
        <Button variant="primary" size="md" onClick={() => setSubmitted({ uuid, signature })} className="mt-1">
          Verify
        </Button>
      </div>

      {isJudge && (
        <div>
          {!judgeLinkComplete ? (
            <Alert variant="warning" title="Incomplete verification link">
              This link is missing the judge, event or signature parameter. Ask the judge to copy
              the full attestation URL from their judging console.
            </Alert>
          ) : judgeRecord === undefined ? (
            <Alert variant="info" title="Checking signature…">
              Comparing the attestation against the event's signed records.
            </Alert>
          ) : judgeRecord.valid ? (
            <Alert variant="success" title="Judge record verified">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-2 text-[13px]">
                <dt className="text-primary font-medium">Judge</dt>
                <dd>{verified?.judgeName ?? "Verified judge"}</dd>
                <dt className="text-primary font-medium">Event</dt>
                <dd>{verified?.eventName ?? "RaptorJudge event"}</dd>
                <dt className="text-primary font-medium">Projects scored</dt>
                <dd className="tnum">{verified?.projectsScored ?? 0}</dd>
                <dt className="text-primary font-medium">Total scores</dt>
                <dd className="tnum">{verified?.totalScoresSubmitted ?? 0}</dd>
                {verified?.issuedAt ? (
                  <>
                    <dt className="text-primary font-medium">Attested</dt>
                    <dd className="tnum">{new Date(verified.issuedAt).toLocaleString()}</dd>
                  </>
                ) : null}
              </dl>
            </Alert>
          ) : (
            <Alert variant="error" title="Judge record could not be verified">
              {judgeRecord.reason || "The signature does not match this judge's records."}
            </Alert>
          )}
        </div>
      )}

      {!isJudge && certResult && (
        <div>
          {certResult.valid ? (
            <Alert variant="success" title="Certificate verified">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-2 text-[13px]">
                <dt className="text-primary font-medium">Recipient</dt>
                <dd>{certResult.certificate?.recipientName}</dd>
                <dt className="text-primary font-medium">Type</dt>
                <dd className="uppercase">{certResult.certificate?.certType}</dd>
                <dt className="text-primary font-medium">Title</dt>
                <dd>{certResult.certificate?.title}</dd>
                <dt className="text-primary font-medium">Issued</dt>
                <dd className="tnum">{new Date(certResult.certificate?.issuedAt ?? 0).toLocaleDateString()}</dd>
              </dl>
            </Alert>
          ) : (
            <Alert variant="error" title="Certificate invalid">
              {certResult.reason || "The provided certificate UUID or signature does not match records."}
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
