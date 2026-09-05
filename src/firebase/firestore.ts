import type { QueryConstraint } from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./config";
import type { UserProfile } from "../types/user.types";
import type { GameResult, LeaderboardEntry } from "../types/game.types";
// import { Buffer } from "node:buffer";

// ─── User Profile ────────────────────────────────────────────────────────────

export const createUserProfile = async (user: User, displayName: string, password: string = "") => {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const profile: Omit<UserProfile, 'uid'> = {
      displayName,
      email: user.email || '',
      photoURL: user.photoURL || '',
      password: btoa(String.fromCharCode(...new TextEncoder().encode(password))),
      createdAt: Date.now(),
      totalGamesPlayed: 0,
      totalWins: 0,
      highScores: {},
    };
    await setDoc(ref, profile);
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as UserProfile;
};

// ─── Game History ─────────────────────────────────────────────────────────────

// One row per player per board, so a better run replaces the player's old one
// instead of adding a second line to the ledger.
const entryId = (uid: string, difficulty: string) => `${uid}_${difficulty}`;

/**
 * A finished game touches three documents — history, leaderboard, profile —
 * and a tab closed partway through used to leave them out of step. All three
 * now land in one transaction: either the whole hand is recorded, or none of
 * it is.
 */
export const saveGameResult = async (result: GameResult): Promise<string> => {
  const historyRef = doc(collection(db, 'gameHistory'));
  const leaderboardRef = doc(
    db,
    'leaderboard',
    result.gameType,
    'scores',
    entryId(result.uid, result.difficulty)
  );
  const userRef = doc(db, 'users', result.uid);

  await runTransaction(db, async tx => {
    const [leaderboardSnap, userSnap] = await Promise.all([tx.get(leaderboardRef), tx.get(userRef)]);

    tx.set(historyRef, { ...result, completedAt: serverTimestamp() });

    const previousEntry = leaderboardSnap.exists() ? (leaderboardSnap.data() as LeaderboardEntry) : null;
    if (!previousEntry || result.score > previousEntry.score) {
      tx.set(leaderboardRef, {
        uid: result.uid,
        displayName: result.displayName,
        score: result.score,
        moves: result.moves,
        timeSeconds: result.timeSeconds,
        difficulty: result.difficulty,
        completedAt: serverTimestamp(),
      });
    } else if (previousEntry.displayName !== result.displayName) {
      // Keep the better run, but let a renamed player show their current name.
      tx.update(leaderboardRef, { displayName: result.displayName });
    }

    const userUpdates: Record<string, unknown> = { totalGamesPlayed: increment(1) };
    if (result.isWin) userUpdates.totalWins = increment(1);
    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      const current = data.highScores?.[result.gameType] ?? 0;
      if (result.score > current) userUpdates[`highScores.${result.gameType}`] = result.score;
    }
    tx.update(userRef, userUpdates);
  });

  return historyRef.id;
};

export const getUserGameHistory = async (uid: string): Promise<GameResult[]> => {
  const q = query(
    collection(db, 'gameHistory'),
    where('uid', '==', uid),
    orderBy('completedAt', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as GameResult));
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

// Filtering by difficulty picks out one row per player by construction. The
// unfiltered board can see a player once per difficulty, so it over-fetches by
// that factor and keeps each player's best — enough to still fill `count` rows.
const DIFFICULTIES = 3; // 4x4, 6x6, 8x8

export const getLeaderboard = async (
  gameType: string,
  difficulty?: string,
  count = 20
): Promise<LeaderboardEntry[]> => {
  const constraints: QueryConstraint[] = [];
  if (difficulty) constraints.push(where('difficulty', '==', difficulty));
  constraints.push(orderBy('score', 'desc'), limit(count * (difficulty ? 1 : DIFFICULTIES)));

  const snap = await getDocs(
    query(collection(db, 'leaderboard', gameType, 'scores'), ...constraints)
  );

  const best = new Map<string, LeaderboardEntry>();
  for (const d of snap.docs) {
    const entry = { id: d.id, ...d.data() } as LeaderboardEntry;
    // Docs arrive score-descending, so the first sighting of a uid is their best.
    if (entry.uid && !best.has(entry.uid)) best.set(entry.uid, entry);
  }
  return [...best.values()].slice(0, count);
};
