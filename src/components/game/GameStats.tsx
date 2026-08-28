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

/** The running tally, set as three ruled columns of tabular figures. */
export default function GameStats({ moves, time, matched, total }: GameStatsProps) {
  return (
    <div className="p-gauges w-full max-w-md">
      <div className="p-gauge">
        <div className="p-figure text-[1.7rem] mb-1.5">{ moves }</div>
        <div className="p-tick text-ink-soft">Moves</div>
      </div>
      <div className="p-gauge">
        <div className="p-figure text-[1.7rem] mb-1.5">{ formatTime(time) }</div>
        <div className="p-tick text-ink-soft">Elapsed</div>
      </div>
      <div className="p-gauge">
        <div className="p-figure text-[1.7rem] mb-1.5">
          { matched }<span className="text-ink-soft">/{ total }</span>
        </div>
        <div className="p-tick text-ink-soft">Pairs</div>
      </div>
    </div>
  );
}
