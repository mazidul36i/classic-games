import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Profile from '../pages/Profile';
import Leaderboard from '../pages/Leaderboard';
import GameLobby from '../pages/GameLobby';
import CardFlipPage from '../pages/CardFlipPage';
import NumberSequencePage from '../pages/NumberSequencePage';
import PatternMemoryPage from '../pages/PatternMemoryPage';
import WordMatchPage from '../pages/WordMatchPage';
import MultiplayerRoom from '../pages/MultiplayerRoom';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="/lobby" element={<GameLobby />} />
          <Route path="/play/card-flip" element={<CardFlipPage />} />
          <Route path="/play/number-sequence" element={<NumberSequencePage />} />
          <Route path="/play/pattern-memory" element={<PatternMemoryPage />} />
          <Route path="/play/word-match" element={<WordMatchPage />} />
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
