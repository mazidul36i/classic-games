import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="app-background" aria-hidden="true" />
      <Navbar />
      <main className="flex-1 relative z-10">
        <Outlet />
      </main>
      <footer className="relative z-10 border-t border-slate-800/60 py-4 text-center text-slate-400 text-sm">
        © { new Date().getFullYear() } Memory Games - Built with ❤️ by <a
        className="text-indigo-400 font-bold" href="https://mazidul.com" target="_blank">Mazidul Islam</a>.
      </footer>
    </div>
  );
}
