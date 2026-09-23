import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ShieldCheck, ShieldX, BadgeCheck } from "lucide-react";

export default function Verify() {
  const { uuid: uuidParam } = useParams<{ uuid?: string }>();
  const [searchParams] = useSearchParams();
  const sigParam = searchParams.get("signature") ?? "";

  const [uuid, setUuid] = useState(uuidParam ?? "");
  const [signature, setSignature] = useState(sigParam);
  const [submitted, setSubmitted] = useState({ uuid: uuidParam ?? "", signature: sigParam });

  const result = useQuery(
    api.certificates.verify,
    submitted.uuid && submitted.signature
      ? { certUuid: submitted.uuid.trim(), signature: submitted.signature.trim() }
      : "skip",
  );

  return (
    <div className="container max-w-2xl py-16">
      <div className="mb-8 text-center">
        <BadgeCheck className="mx-auto mb-3 text-primary" size={36} />
        <h1 className="text-3xl font-bold tracking-tight">Verify a certificate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Certificates are signed with HMAC-SHA256. Paste the certificate UUID and signature to
          check authenticity — the server recomputes the signature and compares in constant time.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="mono-label">certificate uuid</span>
            <input
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              placeholder="e.g. 9f2c…"
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="mono-label">signature (hex)</span>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="sha256-hmac hex string"
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            onClick={() => setSubmitted({ uuid, signature })}
            className="rounded-lg bg-primary px-4 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90"
          >
            verify
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`mt-6 rounded-xl border p-6 ${
            result.valid ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
          }`}
        >
          {result.valid ? (
            <>
              <div className="mb-3 flex items-center gap-2 font-semibold text-success">
                <ShieldCheck size={20} /> Valid certificate
              </div>
              <dl className="grid gap-1.5 font-mono text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">recipient</dt><dd>{result.certificate?.recipientName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">type</dt><dd className="uppercase">{result.certificate?.certType}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">title</dt><dd>{result.certificate?.title}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">issued</dt><dd>{new Date(result.certificate?.issuedAt ?? 0).toLocaleDateString()}</dd></div>
              </dl>
            </>
          ) : (
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <ShieldX size={20} /> Invalid: {result.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
