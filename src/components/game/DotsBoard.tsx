import type { CSSProperties } from "react";
import {
  boxId,
  horizontalEdgeId,
  seatInkAt,
  seatSuitAt,
  verticalEdgeId,
} from "../../utils/dotsUtils";

interface Seat {
  uid: string;
  displayName: string;
}

interface DotsBoardProps {
  gridSize: number;
  edges: Record<string, string>;
  boxes: Record<string, string>;
  /** Seats in the order they sat down — position decides which ink a player draws in. */
  seats: Seat[];
  onClaim: (edgeId: string) => void;
  disabled?: boolean;
}

/**
 * The Dots and Boxes grid.
 *
 * One CSS grid does the whole thing by alternating track sizes: a dot track, a
 * span track, a dot track, and so on. Odd rows and columns are the spans, which
 * makes every line and every box a plain grid cell rather than something
 * positioned by hand.
 *
 * Lines are drawn with CSS transitions rather than per-element animation on
 * purpose — an 8×8 board is 144 of them, and the bundle is a real ceiling here.
 * The reduced-motion block in `index.css` covers the transitions it needs to.
 */
export default function DotsBoard({
  gridSize,
  edges,
  boxes,
  seats,
  onClaim,
  disabled = false,
}: DotsBoardProps) {
  const seatIndex = new Map(seats.map((s, i) => [s.uid, i]));
  const nameOf = (uid: string) => seats.find(s => s.uid === uid)?.displayName ?? "A player";
  /** Suit and ink both come from where the player sits, so the board and the
   *  seat plates cannot disagree about whose box is whose. */
  const suitOf = (uid: string) => seatSuitAt(seatIndex.get(uid) ?? 0);
  const inkOf = (uid: string) => seatInkAt(seatIndex.get(uid) ?? 0);

  const style: CSSProperties = {
    "--dots-grid": gridSize,
  } as CSSProperties;

  const line = (edgeId: string, axis: "h" | "v", label: string) => {
    const owner = edges[edgeId];
    const open = !owner && !disabled;
    return (
      <button
        key={edgeId}
        type="button"
        className={`p-dots-slot p-dots-slot-${axis} ${owner ? `p-dots-drawn ${inkOf(owner)}` : ""}`}
        onClick={open ? () => onClaim(edgeId) : undefined}
        disabled={Boolean(owner) || disabled}
        aria-label={owner ? `${label}, already drawn` : `Draw ${label}`}
      >
        <span className="p-dots-line" aria-hidden="true" />
      </button>
    );
  };

  const rows = [];
  for (let r = 0; r <= gridSize; r++) {
    // A row of dots, with the horizontal lines between them.
    for (let c = 0; c <= gridSize; c++) {
      rows.push(<span key={`d_${r}_${c}`} className="p-dots-dot" aria-hidden="true" />);
      if (c < gridSize) {
        rows.push(
          line(horizontalEdgeId(r, c), "h", `horizontal line ${r + 1}, column ${c + 1}`)
        );
      }
    }
    if (r === gridSize) break;

    // Then a row of vertical lines, with the boxes they enclose between them.
    for (let c = 0; c <= gridSize; c++) {
      rows.push(line(verticalEdgeId(r, c), "v", `vertical line ${c + 1}, row ${r + 1}`));
      if (c < gridSize) {
        const id = boxId(r, c);
        const owner = boxes[id];
        rows.push(
          <span
            key={id}
            className={`p-dots-box ${owner ? `p-dots-closed ${inkOf(owner)}` : ""}`}
            role={owner ? "img" : undefined}
            aria-label={owner ? `${nameOf(owner)}'s box, row ${r + 1}, column ${c + 1}` : undefined}
          >
            {owner && <span aria-hidden="true">{suitOf(owner)}</span>}
          </span>
        );
      }
    }
  }

  return (
    <div className="p-dots" style={style} role="group" aria-label="The board">
      {rows}
    </div>
  );
}
