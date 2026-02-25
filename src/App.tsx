import { useAuthInit } from './hooks/useAuth';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  useAuthInit();
  return <AppRoutes />;
}
