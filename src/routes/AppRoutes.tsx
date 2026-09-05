import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import Profile from '../pages/Profile';
import Leaderboard from '../pages/Leaderboard';
import GameLobby from '../pages/GameLobby';
import CardFlipPage from '../pages/CardFlipPage.tsx';
import NumberSequencePage from '../pages/NumberSequencePage';
import PatternMemoryPage from '../pages/PatternMemoryPage';
import WordMatchPage from '../pages/WordMatchPage';
import MultiplayerRoom from '../pages/MultiplayerRoom';

/* Guests may look around, but they cannot sit down: anything behind this
   bounces to the door and comes straight back once they have signed in. */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (isAuthenticated) return <>{children}</>;
  return (
    <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  );
};

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/action" element={<ResetPassword />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="/lobby" element={<Navigate to="/lobby/card-flip" replace />} />
          <Route path="/lobby/:gameType" element={<GameLobby />} />
          <Route
            path="/play/card-flip"
            element={
              <ProtectedRoute>
                <CardFlipPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/play/number-sequence"
            element={
              <ProtectedRoute>
                <NumberSequencePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/play/pattern-memory"
            element={
              <ProtectedRoute>
                <PatternMemoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/play/word-match"
            element={
              <ProtectedRoute>
                <WordMatchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <ProtectedRoute>
                <MultiplayerRoom />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
