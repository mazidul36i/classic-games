import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function Layout() {
  // Every route runs the "Memory Parlour" letterpress theme, so the paper
  // shell and its fixed grain live here rather than in any single page.
  return (
    <div className="theme-paper parlour min-h-screen flex flex-col relative">
      <div className="parlour-paper" aria-hidden="true" />
      <Navbar />
      <main className="flex-1 relative z-10">
        <Outlet />
      </main>
      <footer className="relative z-10 text-center">
        © { new Date().getFullYear() } The Memory Parlour · Set by <a
        href="https://mazidul.com" target="_blank" rel="noreferrer">Mazidul Islam</a>
      </footer>
    </div>
  );
}
