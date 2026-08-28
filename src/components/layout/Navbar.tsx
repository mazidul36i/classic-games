import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { logout } from "../../firebase/auth";
import { useAuthStore } from "../../store/authStore";

const LINKS = [
  { to: "/", label: "Front Page", match: (p: string) => p === "/" },
  { to: "/lobby/card-flip", label: "The Table", match: (p: string) => p.startsWith("/lobby") || p.startsWith("/play") || p.startsWith("/room") },
  { to: "/leaderboard", label: "Standings", match: (p: string) => p.startsWith("/leaderboard") },
];

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const { reset } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    await logout();
    reset();
    navigate("/");
  };

  return (
    <nav className="p-nav">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-10">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <span className="p-nav-mark">MG</span>
            <span className="p-engrave text-ink-deep text-[0.95rem] tracking-[0.13em] uppercase hidden xs:block">
              Memory <span className="text-vermilion">Parlour</span>
            </span>
          </Link>

          {/* Contents strip — inline on desktop, a second row on small screens */}
          <div className="hidden md:flex items-center gap-8">
            {LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`p-navlink ${item.match(pathname) ? "p-navlink-on" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="flex items-center gap-2.5 group">
                  <span className="p-avatar w-9 h-9 text-sm">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="" />
                    ) : (
                      (user?.displayName || user?.email || "P")[0].toUpperCase()
                    )}
                  </span>
                  <span className="p-tick text-ink-soft group-hover:text-ink-deep transition-colors hidden lg:block">
                    {user?.displayName || "Player"}
                  </span>
                </Link>
                <button onClick={handleLogout} className="p-btn p-btn-sm p-btn-outline">
                  Leave
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="p-navlink hidden sm:inline-flex">
                  Sign in
                </Link>
                <Link to="/register" className="p-btn p-btn-sm p-btn-solid">
                  Join the house
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="md:hidden flex items-center gap-4 xs:gap-6 pb-2.5 -mt-1 overflow-x-auto">
          {LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`p-navlink whitespace-nowrap ${item.match(pathname) ? "p-navlink-on" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          {/* The inline "Sign in" is hidden on narrow screens, so it joins the strip */}
          {!isAuthenticated && (
            <Link
              to="/login"
              className={`p-navlink whitespace-nowrap sm:hidden ${
                pathname === "/login" ? "p-navlink-on" : ""
              }`}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
