import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../firebase/auth';
import { useAuthStore } from '../../store/authStore';

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const { reset } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    reset();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="text-xl font-bold text-white">
              Memory<span className="text-indigo-400">Games</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
            >
              Home
            </Link>
            <Link
              to="/lobby"
              className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
            >
              Play
            </Link>
            <Link
              to="/leaderboard"
              className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
            >
              Leaderboard
            </Link>
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 group">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="avatar"
                      className="w-8 h-8 rounded-full border-2 border-indigo-500"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                      {(user?.displayName || user?.email || 'P')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-slate-300 text-sm group-hover:text-white transition-colors hidden md:block">
                    {user?.displayName || 'Player'}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-all"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
