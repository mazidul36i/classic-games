import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800 py-4 text-center text-slate-500 text-sm">
        © {new Date().getFullYear()} MemoryGames — Play. Remember. Win.
      </footer>
    </div>
  );
}
