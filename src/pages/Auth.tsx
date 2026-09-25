import { useState, FormEvent } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Alert } from "@/components/ui/Alert";
import { resolveReturnTo } from "@/lib/safeRedirect";
import { humanizeConvexError } from "@/lib/errors";

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

export default function Auth() {
  const { signIn } = useAuthActions();
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
      toast.success("Welcome back!");
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      if (raw.includes("ACCOUNT_DISABLED")) {
        setDisabledState(true);
        return;
      } else if (raw.includes("TOTP_REQUIRED")) {
        setNeedsCode(true);
        setError(null);
      } else if (raw.includes("INVALID_TOTP_CODE")) {
        setNeedsCode(true);
        setCode("");
        setError("Invalid two-factor code. Please try again.");
      } else if (raw.includes("TOTP_LOCKED")) {
        setNeedsCode(true);
        setError("Too many wrong codes. Factor locked temporarily.");
      } else if (/TOO_MANY_ATTEMPTS/.test(raw)) {
        setError("Too many attempts for this email. Wait a few minutes and try again.");
      } else {
        setError(humanizeConvexError(err));
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
      toast.success("Account created successfully!");
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      setError(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
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

            <PasswordInput
              label="Password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />

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
                  className="w-full h-10 px-3.5 text-center font-mono text-lg tracking-[0.3em] rounded-input text-primary bg-surface-1 border border-accent transition-colors duration-fast focus:outline-2 focus:outline-accent/40"
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
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />

                <PasswordInput
                  label="Confirm password"
                  required
                  minLength={6}
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

      {/* Right: typographic panel (hidden below lg) */}
      <aside className="hidden lg:flex w-full max-w-[440px] border-l border-line pl-16 flex-col justify-center gap-8">
        <p className="font-mono text-[13px] text-muted">RaptorJudge / DOGFOOD 2026</p>
        <blockquote className="text-h2 text-primary leading-snug">
          &ldquo;A harsh panel and a generous panel should produce the same ranking.&rdquo;
        </blockquote>
        <div className="flex flex-col gap-4 text-sm text-secondary">
          <div className="flex gap-3">
            <span className="font-mono text-accent text-[13px] shrink-0 w-8">01</span>
            <span>Weighted rubrics that lock when judging starts.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-accent text-[13px] shrink-0 w-8">02</span>
            <span>Per-judge z-score normalisation on a 0–10 scale.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-accent text-[13px] shrink-0 w-8">03</span>
            <span>Bradley–Terry pairwise ranking, separate from raw averages.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-accent text-[13px] shrink-0 w-8">04</span>
            <span>A hash-chained audit log behind every privileged write.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
