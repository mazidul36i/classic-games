import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { sendPasswordReset } from "../firebase/auth";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function ForgotPassword() {
  const location = useLocation();
  const reduce = useReducedMotion();
  /* Whatever they had typed at the door comes along, so they need not retype it. */
  const prefill = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(prefill);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send the reset link");
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
            Lost Key
          </span>
        </div>

        <div className="text-center pt-10 pb-9">
          <span className="p-tick text-vermilion">Forgotten password</span>
          <h1 className="p-display text-[clamp(2rem,7vw,2.9rem)] mt-4 leading-[1.06]">
            A new key,
            <br />
            by post.
          </h1>
          <p className="text-[0.95rem] leading-[1.72] text-ink-soft mt-5 max-w-[34ch] mx-auto">
            Tell us the address on your membership and we'll send a link to choose
            a fresh password.
          </p>
        </div>

        <div className="p-panel px-6 sm:px-8 pt-7 pb-8">
          <div className="p-panel-head">
            <span className="p-tick">Reset</span>
            <span className="p-suits flex items-center gap-1.5 text-[0.95rem]" aria-hidden="true">
              <span className="text-ink-deep">♣</span>
              <span className="text-vermilion">♦</span>
            </span>
          </div>

          {error && (
            <div className="p-alert mb-6" role="alert">
              {error}
            </div>
          )}

          {sent ? (
            <div className="p-note" role="status">
              If <strong>{email.trim()}</strong> holds a membership, a reset link is on its
              way. Check your inbox and the spam folder, then follow the link to set a new
              password.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="p-field">
                <label className="p-label" htmlFor="reset-email">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="p-input"
                />
              </div>

              <button type="submit" disabled={loading} className="p-btn p-btn-solid p-btn-block mt-9">
                {loading ? "Sending…" : "Send reset link"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>

        <p className="text-center mt-8">
          <Link to="/login" className="p-link text-ink-deep">
            Back to the members' door
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
