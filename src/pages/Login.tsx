import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { loginWithEmail } from "../firebase/auth";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  /* Where the guard turned them away from, so we can send them back. */
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      navigate(from || "/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
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
      setError(err instanceof Error ? err.message : "Google login failed");
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
            Members' Door
          </span>
        </div>

        <div className="text-center pt-10 pb-9">
          <span className="p-tick text-vermilion">Returning player</span>
          <h1 className="p-display text-[clamp(2rem,7vw,2.9rem)] mt-4 leading-[1.06]">
            Back to
            <br />
            the table.
          </h1>
          {from && (
            <p className="text-[0.95rem] leading-[1.72] text-ink-soft mt-5 max-w-[34ch] mx-auto">
              The house keeps every hand under a name — sign in and we'll take you
              straight to your seat.
            </p>
          )}
        </div>

        <div className="p-panel px-6 sm:px-8 pt-7 pb-8">
          <div className="p-panel-head">
            <span className="p-tick">Sign in</span>
            <span className="p-suits flex items-center gap-1.5 text-[0.95rem]" aria-hidden="true">
              <span className="text-ink-deep">♠</span>
              <span className="text-vermilion">♥</span>
            </span>
          </div>

          {error && (
            <div className="p-alert mb-6" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin}>
            <div className="p-field">
              <label className="p-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
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
              <div className="flex items-baseline justify-between gap-4">
                <label className="p-label" htmlFor="login-password">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  state={email ? { email } : undefined}
                  className="p-link text-ink-soft text-[0.78rem]"
                >
                  Forgotten it?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="p-input"
              />
            </div>

            <button type="submit" disabled={loading} className="p-btn p-btn-solid p-btn-block mt-9">
              {loading ? "Signing in…" : "Take my seat"}
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
          <Link to="/register" state={from ? { from } : undefined} className="p-link text-ink-deep">
            Not a member yet
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
