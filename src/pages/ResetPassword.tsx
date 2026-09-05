import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { checkPasswordResetCode, completePasswordReset } from "../firebase/auth";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Stage = "checking" | "ready" | "done" | "invalid";

/* Lands here from the reset email once the Firebase console's action URL
   points at /auth/action. Reads the code, verifies it, and takes the new key. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [params] = useSearchParams();
  const mode = params.get("mode");
  const code = params.get("oobCode") ?? "";

  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "resetPassword" || !code) {
      setStage("invalid");
      setError(
        mode && mode !== "resetPassword"
          ? "This link is not a password reset link."
          : "This reset link is missing its code. Please use the link from your email."
      );
      return;
    }
    let cancelled = false;
    checkPasswordResetCode(code)
      .then((addr) => {
        if (cancelled) return;
        setEmail(addr);
        setStage("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "This reset link is not valid.");
        setStage("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await completePasswordReset(code, password);
      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 max-w-[30rem] mx-auto px-5 sm:px-6 pt-6 pb-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <div className="p-masthead">
          <span className="p-engrave flex-1 text-center text-ink-deep text-[0.85rem] sm:text-[0.95rem] tracking-[0.14em] uppercase">
            <span className="hidden sm:inline">The Memory Parlour</span>
            <span className="text-vermilion mx-2 hidden sm:inline">✦</span>
            New Key
          </span>
        </div>

        <div className="text-center pt-10 pb-9">
          <span className="p-tick text-vermilion">
            {stage === "done" ? "All set" : "Reset password"}
          </span>
          <h1 className="p-display text-[clamp(2rem,7vw,2.9rem)] mt-4 leading-[1.06]">
            {stage === "done" ? (
              <>
                The lock
                <br />
                is changed.
              </>
            ) : (
              <>
                Choose a
                <br />
                new password.
              </>
            )}
          </h1>
          {stage === "ready" && (
            <p className="text-[0.95rem] leading-[1.72] text-ink-soft mt-5 max-w-[34ch] mx-auto">
              Setting a fresh password for <strong className="text-ink-deep">{email}</strong>.
            </p>
          )}
        </div>

        <div className="p-panel px-6 sm:px-8 pt-7 pb-8">
          <div className="p-panel-head">
            <span className="p-tick">
              {stage === "done" ? "Done" : stage === "invalid" ? "Link" : "New password"}
            </span>
            <span className="p-suits flex items-center gap-1.5 text-[0.95rem]" aria-hidden="true">
              <span className="text-vermilion">♥</span>
              <span className="text-ink-deep">♠</span>
            </span>
          </div>

          {error && (
            <div className="p-alert mb-6" role="alert">
              {error}
            </div>
          )}

          {stage === "checking" && (
            <p className="text-[0.95rem] text-ink-soft" role="status">
              Checking your reset link…
            </p>
          )}

          {stage === "invalid" && (
            <Link to="/forgot-password" className="p-btn p-btn-solid p-btn-block">
              Request a new link
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}

          {stage === "done" && (
            <>
              <div className="p-note mb-7" role="status">
                Your password has been changed. Sign in with the new one to take your seat.
              </div>
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="p-btn p-btn-solid p-btn-block"
              >
                Go to sign in
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {stage === "ready" && (
            <form onSubmit={handleSubmit}>
              {/* Hidden so password managers file the new key under the right account. */}
              <input type="email" autoComplete="username" value={email} readOnly hidden />

              <div className="p-field">
                <label className="p-label" htmlFor="reset-password">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoFocus
                  className="p-input"
                />
              </div>

              <div className="p-field">
                <label className="p-label" htmlFor="reset-confirm">
                  Confirm password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Once more"
                  required
                  minLength={6}
                  className="p-input"
                />
              </div>

              <button type="submit" disabled={loading} className="p-btn p-btn-solid p-btn-block mt-9">
                {loading ? "Saving…" : "Set new password"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>

        {stage !== "done" && (
          <p className="text-center mt-8">
            <Link to="/login" className="p-link text-ink-deep">
              Back to the members' door
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
