/**
 * The part of quick match that decides *which* open table to walk to, kept
 * apart from the database so it can be reasoned about — and tested — on its own.
 *
 * Two players who press "find an opponent" in the same second both read an
 * empty index, so both open a table. A poll later each can see the other's, and
 * the whole thing turns on what they do next: if both move, they swap tables
 * and neither is ever matched. So only the higher room code moves. The lower
 * one stays put and gets sat at, whichever order the two arrive in, and neither
 * player needs to know the other exists for it to hold.
 */
export const pickOpponentRooms = (
  candidateIds: string[],
  ownRoomId: string | null
): string[] =>
  candidateIds
    .filter(id => id !== ownRoomId)
    // Holding no table of our own, anything open will do.
    .filter(id => ownRoomId === null || id < ownRoomId)
    .sort();
