export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-10">
        <h1 className="text-h1 text-primary">Privacy Policy</h1>
        <p className="text-[13px] text-muted mt-1.5">Last updated: March 2026</p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-h3 text-accent">1. Offline-First Privacy Guarantee</h2>
          <p className="text-secondary">
            RaptorJudge is engineered for self-hosted, privacy-first operations. The platform
            contains zero third-party telemetry, no analytics trackers, and no external font or
            script CDN dependencies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-h3 text-accent">2. Information Collected</h2>
          <p className="text-secondary">
            We process minimal user account data necessary for hackathon operation: email address,
            display name, user role, and optional profile avatar. Authentication tokens are stored
            strictly in session memory (<code className="font-mono text-[13px]">sessionStorage</code>)
            and cleared when the browser closes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-h3 text-accent">3. Audit Trail & Logging</h2>
          <p className="text-secondary">
            Administrative and organizer actions (such as score submission, role modifications, and
            certificate issuance) are stored in an append-only cryptographic audit trail to ensure
            judging transparency and auditability.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-h3 text-accent">4. Security & Data Storage</h2>
          <p className="text-secondary">
            Passwords and two-factor authentication secrets are securely hashed and stored within
            the self-hosted Convex/PostgreSQL database.
          </p>
        </section>
      </div>
    </div>
  );
}
