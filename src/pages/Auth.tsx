import React, { useState, FormEvent } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Alert } from "@/components/ui/Alert";
import { resolveReturnTo } from "@/lib/safeRedirect";
import { humanizeConvexError } from "@/lib/errors";

const DEMO_ACCOUNTS = [
  { email: "admin@raptors.dev", label: "Admin", role: "admin" },
  { email: "organizer@raptors.dev", label: "Organizer", role: "organizer" },
  { email: "judge1@raptors.dev", label: "Judge 1", role: "judge" },
  { email: "participant1@raptors.dev", label: "Participant", role: "participant" },
];

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
    "/home"
  );
  const reseed = useAction(api.seed.seed);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);

  // Form Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Signup Step 2 Fields
  const [profession, setProfession] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [experience, setExperience] = useState("");

  // TOTP State
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

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
      navigate("/home", { replace: true });
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      if (raw === "TOTP_REQUIRED") {
        setNeedsCode(true);
        setError(null);
      } else if (raw === "INVALID_TOTP_CODE") {
        setNeedsCode(true);
        setCode("");
        setError("Invalid two-factor code. Please try again.");
      } else if (raw === "TOTP_LOCKED") {
        setNeedsCode(true);
        setError("Too many wrong codes. Factor locked temporarily.");
      } else if (/Invalid email or password/i.test(raw) || /InvalidSecret|InvalidAccountId/i.test(raw)) {
        setError("Invalid email or password. Default demo password is 'dogfood2026'.");
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
      navigate("/home", { replace: true });
    } catch (err: any) {
      setError(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function quickFill(demoEmail: string) {
    setMode("signin");
    setEmail(demoEmail);
    setPassword("dogfood2026");
    setNeedsCode(false);
    setCode("");
    setError(null);
  }

  return (
    <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center py-6 px-4">
      {/* Container max 420px */}
      <div className="w-full max-w-[420px] flex flex-col items-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#ff0055] to-[#ff5588] text-white flex items-center justify-center font-black text-xl shadow-md shadow-[#ff0055]/30 mb-3">
            R
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1d1d1f]">
            {mode === "signin" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-xs text-[#6e6e73] mt-1">
            {mode === "signin"
              ? "Sign in to access your hackathon workspace"
              : "Register as a participant for upcoming events"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="w-full grid grid-cols-2 p-1 gap-1 rounded-input bg-white/40 border border-white/70 backdrop-blur-md mb-6 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-button transition-all duration-150 ${
              mode === "signin"
                ? "bg-white text-[#1d1d1f] shadow-sm font-bold"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setSignupStep(1);
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-button transition-all duration-150 ${
              mode === "signup"
                ? "bg-white text-[#1d1d1f] shadow-sm font-bold"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Auth Glass Card */}
        <GlassCard className="w-full p-6 shadow-xl border-white/80">
          {error && (
            <Alert variant="error" className="mb-4 text-xs">
              {error}
            </Alert>
          )}

          {mode === "signin" ? (
            <form onSubmit={handleSignInSubmit} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
              />

              <PasswordInput
                label="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {needsCode && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#1d1d1f]">
                    6-Digit Authenticator Code
                  </label>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.3em] rounded-input text-[#1d1d1f] bg-white/50 border border-[#ff0055] focus-ring-accent"
                  />
                  <span className="text-[11px] text-[#6e6e73]">
                    Two-factor is active on this account
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs my-0.5">
                <Checkbox
                  label="Remember me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                {needsCode && (
                  <Link
                    to="/help"
                    className="text-[#ff0055] font-medium hover:underline text-xs"
                  >
                    Forgot code?
                  </Link>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={busy}
                className="w-full mt-2"
              >
                Sign in
              </Button>

              <div className="text-center text-xs text-[#6e6e73] mt-2">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setSignupStep(1);
                  }}
                  className="text-[#ff0055] font-bold hover:underline"
                >
                  Sign up now
                </button>
              </div>
            </form>
          ) : (
            /* Signup Form (2 Steps) */
            <div>
              {signupStep === 1 ? (
                <form onSubmit={handleSignupNextStep} className="flex flex-col gap-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#ff0055]">
                    Step 1 of 2 — Account Details
                  </div>

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

                  <div className="my-1">
                    <Checkbox
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      label={
                        <span className="text-xs text-[#6e6e73]">
                          I agree to the{" "}
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#ff0055] underline"
                          >
                            Terms
                          </a>{" "}
                          and{" "}
                          <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#ff0055] underline"
                          >
                            Privacy Policy
                          </a>
                        </span>
                      }
                    />
                  </div>

                  <Button type="submit" variant="primary" size="md" className="w-full mt-1">
                    Continue to Profile →
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignupSubmit} className="flex flex-col gap-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#ff0055]">
                    Step 2 of 2 — Participant Profile
                  </div>

                  <Dropdown
                    label="Profession / Role"
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
                    label="Experience Level"
                    options={EXPERIENCE_LEVELS}
                    value={experience}
                    onChange={(v) => setExperience(v)}
                    placeholder="Select your experience level"
                  />

                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => setSignupStep(1)}
                      className="w-1/3"
                    >
                      ← Back
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={busy}
                      className="w-2/3"
                    >
                      Complete Signup
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </GlassCard>

        {/* Demo Accounts Box */}
        <div className="w-full mt-6">
          <GlassCard className="p-4 text-xs">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-black/5">
              <span className="font-bold text-[#1d1d1f]">Demo Accounts</span>
              <span className="text-[10px] font-mono text-[#6e6e73]">Pass: dogfood2026</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => quickFill(account.email)}
                  className="px-2.5 py-1.5 rounded-button bg-white/50 border border-white/80 hover:bg-white/80 text-left transition-colors"
                >
                  <p className="font-bold text-[#1d1d1f] truncate">{account.label}</p>
                  <p className="text-[10px] text-[#6e6e73] truncate">{account.email}</p>
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await reseed({});
                  toast.success("Demo fixtures re-seeded successfully!");
                } catch (err: any) {
                  setError(err?.message || "Failed to seed demo data");
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full mt-3 text-xs"
            >
              ⚡ Reseed Demo Data
            </Button>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
