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

import { useQuery, useConvexAuth } from "convex/react";

export default function Auth() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const settingsQuery = useQuery(api.admin.getSettings, skip ? "skip" : {});
  const settings = settingsQuery && !(settingsQuery instanceof Error) ? settingsQuery : {};
  const supportEmail = settings["support_email"] || settings["supportEmail"] || "the platform administrator";

  const returnTo = resolveReturnTo(
    location.pathname !== "/auth" ? location.pathname : searchParams.get("returnTo"),
    "/home"
  );
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

  // Disabled Account State
  const [disabledState, setDisabledState] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { signOut } = useAuthActions();

  async function handleSignInSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signOut().catch(() => {});
      sessionStorage.clear();
      localStorage.removeItem("__convexAuthJWT_raptorjudge");
      localStorage.removeItem("__convexAuthRefreshToken_raptorjudge");

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
      if (raw === "ACCOUNT_DISABLED" || raw.includes("ACCOUNT_DISABLED")) {
        setDisabledState(true);
        return;
      } else if (raw === "TOTP_REQUIRED") {
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
        setError("Invalid email or password. Please check your credentials.");
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

  if (disabledState) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center py-6 px-4">
        <div className="w-full max-w-[420px] flex flex-col items-center">
          <GlassCard className="w-full p-8 shadow-xl border-white/80 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xl">
              ⚠️
            </div>
            <h1 className="text-xl font-black text-[#1d1d1f]">Your account has been disabled</h1>
            <p className="text-xs text-[#6e6e73] leading-relaxed">
              If you believe this was a mistake, contact us at <span className="font-semibold text-[#1d1d1f]">{supportEmail}</span>.
            </p>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setDisabledState(false);
                setError(null);
              }}
              className="w-full mt-2"
            >
              Back to sign in
            </Button>
          </GlassCard>
        </div>
      </div>
    );
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

      </div>
    </div>
  );
}
