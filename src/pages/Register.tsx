import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { registerWithEmail } from "../firebase/auth";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  /* Passed along from the sign-in door, so joining lands on the same seat. */
  const from = (location.state as { from?: string } | null)?.from;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await registerWithEmail(email, password, displayName);
      navigate(from || "/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

/*
  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate(from || "/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };
*/

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
            New Member
          </span>
        </div>

        <div className="text-center pt-10 pb-9">
          <span className="p-tick text-vermilion">First visit</span>
          <h1 className="p-display text-[clamp(2rem,7vw,2.9rem)] mt-4 leading-[1.06]">
            Sign the
            <br />
            register.
          </h1>
        </div>

        <div className="p-panel px-6 sm:px-8 pt-7 pb-8">
          <div className="p-panel-head">
            <span className="p-tick">Membership</span>
            <span className="p-suits flex items-center gap-1.5 text-[0.95rem]" aria-hidden="true">
              <span className="text-vermilion">♦</span>
              <span className="text-ink-deep">♣</span>
            </span>
          </div>

          {error && (
            <div className="p-alert mb-6" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div className="p-field">
              <label className="p-label" htmlFor="reg-name">
                Name at the table
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                className="p-input"
              />
            </div>

            <div className="p-field">
              <label className="p-label" htmlFor="reg-email">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="p-input"
              />
            </div>

            <div className="p-field">
              <label className="p-label" htmlFor="reg-password">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least six characters"
                required
                className="p-input"
              />
              <p className="p-tick p-tick-plain text-ink-soft mt-2">
                Six characters or more.
              </p>
            </div>

            <button type="submit" disabled={loading} className="p-btn p-btn-solid p-btn-block mt-9">
              {loading ? "Signing you in…" : "Enter my name"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/*<div className="flex items-center gap-4 my-7">*/}
          {/*  <span className="flex-1 p-rule" />*/}
          {/*  <span className="p-tick text-ink-soft">or</span>*/}
          {/*  <span className="flex-1 p-rule" />*/}
          {/*</div>*/}

          {/*<button*/}
          {/*  onClick={handleGoogleLogin}*/}
          {/*  disabled={loading}*/}
          {/*  className="p-btn p-btn-outline p-btn-block"*/}
          {/*>*/}
          {/*  Continue with Google*/}
          {/*</button>*/}
        </div>

        <p className="text-center mt-8">
          <Link to="/login" state={from ? { from } : undefined} className="p-link text-ink-deep">
            Already have a seat
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
