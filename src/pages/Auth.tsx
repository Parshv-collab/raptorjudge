import { useState, FormEvent, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useAction, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Terminal, Loader2, DatabaseZap } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "admin@raptors.dev", label: "Admin", desc: "full control + role switcher" },
  { email: "organizer@raptors.dev", label: "Organizer", desc: "run the event" },
  { email: "judge1@raptors.dev", label: "Judge (Dr. Strict)", desc: "harsh calibration" },
  { email: "judge2@raptors.dev", label: "Judge (Prof. Generous)", desc: "lenient calibration" },
  { email: "judge3@raptors.dev", label: "Judge (Alice Balanced)", desc: "baseline calibration" },
  { email: "participant1@raptors.dev", label: "Participant", desc: "team workspace" },
];

export default function Auth() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);

  // Explicit returnTo param if user was redirected to /auth?returnTo=...
  const explicitReturnTo = searchParams.get("returnTo");

  useEffect(() => {
    if (!isAuthenticated || !me) return;
    const routes: Record<string, string> = {
      admin: "/organizer",
      organizer: "/organizer",
      judge: "/judge",
      participant: "/workspace",
    };
    const dest = explicitReturnTo ?? routes[me.role ?? "participant"] ?? "/";
    if (window.location.pathname !== dest) {
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, me, navigate, explicitReturnTo]);

  const reseed = useAction(api.seed.seed);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn("password", { email, password, flow: "signIn" });
      } else {
        await signIn("password", { email, password, name, flow: "signUp" });
      }
    } catch (err: any) {
      setBusy(false);
      // Convex Auth reports a wrong password as a bare "InvalidSecret", which
      // reads like a server fault. Say what it actually means.
      const raw = String(err?.message ?? "");
      setError(
        /InvalidSecret/i.test(raw)
          ? "Wrong email or password. Demo accounts all use the password dogfood2026 — click a demo account to fill it in, or press “seed demo data”."
          : raw || "Authentication failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function quickFill(demoEmail: string) {
    setMode("signin");
    setEmail(demoEmail);
    setPassword("dogfood2026");
  }

  return (
    <div className="container grid min-h-[calc(100vh-3.5rem)] max-w-5xl grid-cols-1 items-center gap-10 py-12 lg:grid-cols-2">
      {/* Left: brand + demo accounts */}
      <div className="hidden lg:block">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Terminal size={20} />
          </span>
          <div>
            <div className="font-mono text-lg font-bold">RaptorJudge</div>
            <div className="mono-label">hackathon judging, engineered</div>
          </div>
        </div>

        <h1 className="mb-3 text-3xl font-bold leading-tight">
          Sign in to run the
          <span className="text-primary glow-text"> Dogfood 2026</span> demo
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Seeded fixture data includes judges with deliberately different calibration — sign in as
          each one to see how normalization changes the rankings.
        </p>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mono-label mb-3">demo accounts · password: dogfood2026</div>
          <div className="grid gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => quickFill(a.email)}
                className="flex items-center justify-between rounded-md px-3 py-2 text-left transition hover:bg-secondary"
              >
                <div>
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{a.email}</div>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-primary">{a.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <Terminal size={18} className="text-primary" />
          <span className="font-mono font-bold">RaptorJudge</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-5 flex gap-1 rounded-lg bg-muted p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition ${
                mode === "signin" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setMode("signin")}
            >
              sign in
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition ${
                mode === "signup" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setMode("signup")}
            >
              sign up
            </button>
          </div>

          <form onSubmit={submit} className="grid gap-3">
            {mode === "signup" && (
              <label className="grid gap-1">
                <span className="mono-label">name</span>
                <input
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  required
                />
              </label>
            )}
            <label className="grid gap-1">
              <span className="mono-label">email</span>
              <input
                type="email"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@raptors.dev"
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="mono-label">password</span>
              <input
                type="password"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === "signin" ? "sign in" : "create account"}
            </button>
          </form>
        </div>

        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await reseed({});
              toast.success("Fixture data seeded — sign in with any demo account");
            } catch (err: any) {
              setError(err?.message ?? "Seed failed");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
        >
          <DatabaseZap size={14} />
          {busy ? "seeding fixtures…" : "seed demo data (fresh install)"}
        </button>

        <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground">
          offline-first · self-hosted · no third-party auth
        </p>
      </div>
    </div>
  );
}
