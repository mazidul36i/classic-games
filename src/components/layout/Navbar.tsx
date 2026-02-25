import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { logout } from "../../firebase/auth";
import { useAuthStore } from "../../store/authStore";

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const { reset } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    reset();
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 surface-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3">
            <span className="logo-mark">MG</span>
            <span className="text-lg font-semibold text-white tracking-tight">
              Memory<span className="text-accent"> Games</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            { [
              { to: "/", label: "Home" },
              { to: "/lobby", label: "Play" },
              { to: "/leaderboard", label: "Leaderboard" },
            ].map((item) => (
              <Link
                key={ item.to }
                to={ item.to }
                className="text-sm font-medium text-text-muted hover:text-white transition-colors"
              >
                { item.label }
              </Link>
            )) }
          </div>

          <div className="flex items-center gap-3">
            { isAuthenticated ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 group">
                  { user?.photoURL ? (
                    <img
                      src={ user.photoURL }
                      alt="avatar"
                      className="w-8 h-8 rounded-full border border-accent"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-[#072225] text-sm font-bold">
                      { (user?.displayName || user?.email || "P")[0].toUpperCase() }
                    </div>
                  ) }
                  <span
                    className="text-sm text-text-muted group-hover:text-white transition-colors hidden md:block">
                    { user?.displayName || "Player" }
                  </span>
                </Link>
                <button
                  onClick={ handleLogout }
                  className="btn btn-ghost px-3 py-1.5 text-sm"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-text-muted hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn btn-primary px-4 py-2 text-sm"
                >
                  Sign Up
                </Link>
              </>
            ) }
          </div>
        </div>
      </div>
    </nav>
  );
}
