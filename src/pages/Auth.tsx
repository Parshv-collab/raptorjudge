import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";
import { HeroCarousel } from "@/components/auth/HeroCarousel";
import { resolveReturnTo } from "@/lib/safeRedirect";
import { humanizeConvexError } from "@/lib/errors";
import { roleHomePath } from "@/lib/roles";
import { clearConvexAuthSessionKeys } from "@/lib/sessionCleanup";
import { describeSignInFailureForUser } from "@/convex/lib/signInErrors";

const PROFESSIONS = [
  { value: "developer", label: "Software Developer / Engineer" },
  { value: "designer", label: "UI/UX Designer" },
  { value: "student", label: "Student / Researcher" },
  { value: "product_manager", label: "Product Manager" },
  { value: "data_scientist", label: "Data Scientist / AI Engineer" },
  { value: "other", label: "Other" },
];

const INTERESTS = [
  { id: "ai", label: "AI & ML" },
  { id: "web3", label: "Web3 & Crypto" },
  { id: "mobile", label: "Mobile Apps" },
  { id: "cloud", label: "DevOps & Cloud" },
  { id: "game", label: "Game Dev" },
  { id: "hardware", label: "Hardware & IoT" },
  { id: "cybersecurity", label: "Cybersecurity" },
  { id: "design", label: "UX & Product Design" },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner (0-1 years)" },
  { value: "intermediate", label: "Intermediate (2-4 years)" },
  { value: "advanced", label: "Advanced (5+ years)" },
];

/** How many times we re-ask for the role before showing the waiting screen. */
const ROLE_LOOKUP_ATTEMPTS = 4;

export default function Auth() {
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const returnTo = resolveReturnTo(
    location.pathname !== "/auth" ? location.pathname : searchParams.get("returnTo"),
    "/home",
  );

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Signup step 2 fields
  const [profession, setProfession] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [experience, setExperience] = useState("");

  // TOTP state
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  // Disabled-account state (server said ACCOUNT_DISABLED: password was right,
  // an admin genuinely disabled the account)
  const [disabledState, setDisabledState] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  /**
   * Set when the credentials were accepted but the role has not arrived yet.
   * We wait for `users.me` rather than defaulting to a participant dashboard,
   * because defaulting is exactly what sends a judge to the wrong console.
   */
  const [awaitingRole, setAwaitingRole] = useState(false);
  /** Issue 17: flips after ROLE_TIMEOUT_MS on the waiting screen. */
  const [staleTimer, setStaleTimer] = useState(false);

  const liveMe = useQuery(api.users.me, awaitingRole ? {} : "skip");

  /**
   * Issue 17: wipe any stale Convex Auth tokens before a new sign-in starts.
   *
   * This used to run at **module scope**, which was a real bug rather than a
   * style nit. `App.tsx` imports this module to build its route table, so the
   * statement ran while the bundle was still evaluating — on *every* page load,
   * not just a visit to `/auth`. Reloading `/admin`, following a bookmark, or
   * opening a shared link therefore deleted the live JWT and refresh token and
   * bounced a signed-in user to the sign-in form. In-app navigation kept
   * working, because the module had already been evaluated once.
   *
   * Scoped to the component it now only fires for a visitor who has actually
   * landed here signed out, which is the case it was written for. A signed-in
   * user reaching `/auth` keeps their session; a token the server rejects is
   * still cleaned up by the sign-in failure path below.
   */
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    clearConvexAuthSessionKeys();
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!awaitingRole) return;
    const home = roleHomePath(liveMe?.role);
    if (home) {
      const dest = returnTo && returnTo !== "/home" ? returnTo : home;
      navigate(dest, { replace: true });
      toast.success("Welcome back!");
    }
  }, [awaitingRole, liveMe, navigate, returnTo]);

  // Issue 17: bound the wait. If the role query has not settled within 5s,
  // surface the stale-session screen instead of spinning forever.
  useEffect(() => {
    if (!awaitingRole) {
      setStaleTimer(false);
      return;
    }
    const timer = setTimeout(() => setStaleTimer(true), 5000);
    return () => clearTimeout(timer);
  }, [awaitingRole]);

  /** Issue 17: sign-out from the waiting screen must kill the stale tokens. */
  async function handleSignOutFromHere() {
    clearConvexAuthSessionKeys();
    try {
      await signOut();
    } catch {
      // The session may already be unusable — the manual wipe above is the
      // part that matters for the next sign-in.
    }
    navigate("/auth", { replace: true });
  }

  /** Ask `users.me` for the freshly-minted session's role. */
  async function lookupRole(): Promise<string | null> {
    for (let attempt = 0; attempt < ROLE_LOOKUP_ATTEMPTS; attempt++) {
      try {
        const me = await convex.query(api.users.me, {});
        if (me?.role) return me.role;
      } catch {
        // Session not visible to the client yet — retry below.
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return null;
  }

  /**
   * Land immediately on the right console.
   *
   * This runs inside the success branch of the sign-in/sign-up call (not from
   * an effect that watches `isAuthenticated`), so `/auth` is left behind the
   * moment the credentials are accepted. If the role cannot be read yet we show
   * the waiting screen and let the `users.me` subscription finish the job.
   */
  async function landAfterAuth(successMessage: string) {
    toast.success(successMessage);
    const role = await lookupRole();
    const home = roleHomePath(role);
    if (!home) {
      setAwaitingRole(true);
      return;
    }
    const dest = returnTo && returnTo !== "/home" ? returnTo : home;
    navigate(dest, { replace: true });
  }

  async function handleSignInSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", {
        email,
        password,
        flow: "signIn",
        ...(needsCode && code ? { totp: code } : {}),
      });
      await landAfterAuth("Welcome back!");
    } catch (err: any) {
      // One funnel for every failure: strip transport noise, then translate to
      // finished copy. Raw library text never reaches the screen.
      const cleaned = humanizeConvexError(err);
      if (cleaned.includes("ACCOUNT_DISABLED")) {
        setDisabledState(true);
      } else if (cleaned.includes("TOTP_REQUIRED")) {
        setNeedsCode(true);
        setError(null);
      } else if (cleaned.includes("INVALID_TOTP_CODE") || cleaned.includes("TOTP_LOCKED")) {
        setNeedsCode(true);
        setCode("");
        setError(describeSignInFailureForUser(cleaned));
      } else {
        setError(describeSignInFailureForUser(cleaned));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignupNextStep(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptedTerms) {
      setError("You must accept the Terms and Privacy Policy to continue.");
      return;
    }
    setSignupStep(2);
  }

  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", {
        email,
        password,
        name,
        flow: "signUp",
      });
      await landAfterAuth("Account created successfully!");
    } catch (err: any) {
      setError(describeSignInFailureForUser(humanizeConvexError(err)));
    } finally {
      setBusy(false);
    }
  }

  if (awaitingRole) {
    // Issue 17: the role has not arrived. Two distinct reasons, two screens:
    //   • the account genuinely has no role (fresh self-signup) → explain and
    //     offer sign-out; waiting longer will never change anything.
    //   • the role query is still resolving (or the session is stale) → give
    //     it a few seconds, then offer sign-out with the stale-session hint.
    // A third timer (below) keeps the spinner from running forever when the
    // query itself never settles.
    const me = liveMe;
    const timedOut = staleTimer;
    if (me !== undefined) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-surface-1 border border-line rounded-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full border border-warning/40 bg-warning/10 text-warning flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-h3 text-primary">Your account isn&apos;t assigned a role yet</h1>
            <p className="text-[13px] text-secondary leading-relaxed">
              Ask your organizer to invite you, or sign up via an invite link. Your account was
              created successfully — it just doesn&apos;t have a role attached yet.
            </p>
            <Button variant="secondary" onClick={handleSignOutFromHere} className="mt-2">
              Sign out
            </Button>
          </div>
        </div>
      );
    }
    if (timedOut) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-surface-1 border border-line rounded-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-10 h-10 rounded-pill border-2 border-line border-t-accent animate-spin" aria-hidden="true" />
            <h1 className="text-h3 text-primary">Session may be stale</h1>
            <p className="text-[13px] text-secondary leading-relaxed">
              Your workspace is taking unusually long to load. Sign out and back in to refresh your
              session.
            </p>
            <Button variant="secondary" onClick={handleSignOutFromHere} className="mt-2">
              Sign out
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface-1 border border-line rounded-card p-8 flex flex-col items-center text-center gap-4">
          <div className="w-10 h-10 rounded-pill border-2 border-line border-t-accent animate-spin" aria-hidden="true" />
          <h1 className="text-h3 text-primary">Preparing your workspace</h1>
          <p className="text-[13px] text-secondary leading-relaxed">
            Signed in. Resolving your role so you land in the right console…
          </p>
        </div>
      </div>
    );
  }

  if (disabledState) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface-1 border border-warning/40 rounded-card p-8 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full border border-warning/40 bg-warning/10 text-warning flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-h3 text-primary">Your account has been disabled</h1>
          <p className="text-[13px] text-secondary leading-relaxed">
            This account was disabled by an administrator. If you believe this is a mistake, contact
            the event organizer.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setDisabledState(false);
              setError(null);
            }}
            className="mt-2"
          >
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-stretch justify-center gap-16 py-10">
      {/* Left: form column */}
      <div className="w-full max-w-[420px] flex flex-col justify-center">
        <div className="flex flex-col gap-1 mb-8">
          <h1 className="text-h1 text-primary">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-secondary">
            {mode === "signin"
              ? "Access your judging queue, team workspace or event console."
              : "Register as a participant for upcoming events."}
          </p>
        </div>

        {/* Mode switch */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-btn border border-line bg-surface-1 mb-6">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSignupStep(1);
                setError(null);
              }}
              className={`h-9 text-[13px] font-medium rounded-[4px] transition-colors duration-fast ${
                mode === m ? "bg-surface-2 text-primary" : "text-secondary hover:text-primary"
              }`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {mode === "signin" ? (
          <form onSubmit={handleSignInSubmit} className="flex flex-col gap-4">
            <Input
              label="Email address"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />

            <div className="flex flex-col gap-2">
              <PasswordInput
                label="Password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="self-start text-[13px] text-accent hover:text-accent-hover transition-colors duration-fast"
              >
                Forgot password?
              </button>
            </div>

            {needsCode && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="totp-code" className="text-[13px] text-secondary">
                  6-digit authenticator code
                </label>
                <input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full h-10 px-3.5 text-center font-mono text-lg tracking-[0.3em] rounded-input text-primary bg-surface-1 border border-accent transition-colors duration-fast focus:outline-2 focus:outline-accent"
                />
                <span className="text-[13px] text-muted">Two-factor is active on this account</span>
              </div>
            )}

            <Button type="submit" variant="primary" size="md" isLoading={busy} className="w-full mt-2">
              Sign in
            </Button>

            <p className="text-center text-[13px] text-secondary mt-1">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setSignupStep(1);
                }}
                className="text-accent hover:text-accent-hover font-medium"
              >
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <div>
            {signupStep === 1 ? (
              <form onSubmit={handleSignupNextStep} className="flex flex-col gap-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
                  Step 1 of 2 — account details
                </span>

                <Input
                  label="Full name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                />

                <Input
                  label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                />

                <PasswordInput
                  label="Password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />

                <PasswordInput
                  label="Confirm password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />

                <Checkbox
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  label={
                    <span className="text-[13px] text-secondary">
                      I agree to the{" "}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        Terms
                      </a>{" "}
                      and{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        Privacy Policy
                      </a>
                    </span>
                  }
                />

                <Button type="submit" variant="primary" size="md" className="w-full mt-1">
                  Continue
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignupSubmit} className="flex flex-col gap-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
                  Step 2 of 2 — participant profile
                </span>

                <Dropdown
                  label="Profession / role"
                  options={PROFESSIONS}
                  value={profession}
                  onChange={(v) => setProfession(v)}
                  placeholder="Select primary profession"
                />

                <ChipGroup
                  label="Interests"
                  options={INTERESTS}
                  selectedIds={selectedInterests}
                  onChange={(ids) => setSelectedInterests(ids)}
                  maxSelectable={5}
                />

                <Dropdown
                  label="Experience level"
                  options={EXPERIENCE_LEVELS}
                  value={experience}
                  onChange={(v) => setExperience(v)}
                  placeholder="Select your experience level"
                />

                <div className="flex gap-3 mt-2">
                  <Button type="button" variant="secondary" size="md" onClick={() => setSignupStep(1)} className="w-1/3">
                    Back
                  </Button>
                  <Button type="submit" variant="primary" size="md" isLoading={busy} className="w-2/3">
                    Complete signup
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Right: rotating typographic panel (hidden below lg) */}
      <HeroCarousel className="hidden lg:flex w-full max-w-[440px] border-l border-line pl-16 flex-col justify-center" />

      {/* Forgot password — self-hosted, so the honest answer is "ask a human" */}
      <Modal
        isOpen={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Password reset"
        maxWidth="md"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] text-secondary leading-relaxed">
            This is a self-hosted deployment with no external email service, so there is no
            automatic reset link. Contact your event organizer or administrator — they can issue a
            temporary password from the admin console, which you then change from{" "}
            <span className="font-mono text-primary">/security</span>.
          </p>
          <p className="text-[13px] text-muted leading-relaxed">
            If you are the administrator, the reset action lives on{" "}
            <span className="font-mono text-primary">/admin/users</span> next to each account.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setForgotOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
