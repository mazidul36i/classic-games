interface GameStatsProps {
  moves: number;
  time: number;
  matched: number;
  total: number;
}

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${ m }:${ s }`;
};

export default function GameStats({ moves, time, matched, total }: GameStatsProps) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-5 flex-wrap">
      <div
        className="flex flex-col items-center bg-slate-800 rounded-xl px-3 sm:px-4 md:px-6 py-2 md:py-3 border border-slate-700 min-w-22.5">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Moves</span>
        <span className="text-xl md:text-2xl font-bold text-white mt-0 sm:mt-1">{ moves }</span>
      </div>
      <div
        className="flex flex-col items-center bg-slate-800 rounded-xl px-3 sm:px-4 md:px-6 py-2 md:py-3 border border-slate-700 min-w-22.5">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Time</span>
        <span className="text-xl md:text-2xl font-bold text-indigo-400 mt-0 sm:mt-1">{ formatTime(time) }</span>
      </div>
      <div
        className="flex flex-col items-center bg-slate-800 rounded-xl px-3 sm:px-4 md:px-6 py-2 md:py-3 border border-slate-700 min-w-22.5">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Pairs</span>
        <span className="text-xl md:text-2xl font-bold text-emerald-400 mt-0 sm:mt-1">{ matched }/{ total }</span>
      </div>
    </div>
  );
}
