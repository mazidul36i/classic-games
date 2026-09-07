import { useEffect } from 'react';
import { useAuthInit } from './hooks/useAuth';
import { installUnlock } from './audio/engine';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  useAuthInit();

  // Browsers hold audio shut until the page has been touched. Most cues follow
  // a click anyway, but the multiplayer turn bell rings on an *opponent's*
  // move, so the first gesture of the session has to count for it.
  useEffect(() => installUnlock(), []);

  return <AppRoutes />;
}
