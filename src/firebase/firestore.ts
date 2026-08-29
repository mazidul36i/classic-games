import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  increment,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './config';
import type { UserProfile } from '../types/user.types';
import type { GameResult, LeaderboardEntry } from '../types/game.types';

// ─── User Profile ────────────────────────────────────────────────────────────

export const createUserProfile = async (user: User, displayName: string) => {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const profile: Omit<UserProfile, 'uid'> = {
      displayName,
      email: user.email || '',
      photoURL: user.photoURL || '',
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

export const updateUserStats = async (
  uid: string,
  isWin: boolean,
  gameType: string,
  score: number
) => {
  const ref = doc(db, 'users', uid);
  const updates: Record<string, unknown> = {
    totalGamesPlayed: increment(1),
  };
  if (isWin) updates.totalWins = increment(1);

  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as UserProfile;
    const current = data.highScores?.[gameType] ?? 0;
    if (score > current) {
      updates[`highScores.${gameType}`] = score;
    }
  }
  await updateDoc(ref, updates);
};

// ─── Game History ─────────────────────────────────────────────────────────────

export const saveGameResult = async (result: GameResult): Promise<string> => {
  const ref = await addDoc(collection(db, 'gameHistory'), {
    ...result,
    completedAt: serverTimestamp(),
  });

  await submitLeaderboardScore(result);
  await updateUserStats(result.uid, result.isWin, result.gameType, result.score);
  return ref.id;
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

// One row per player per board, so a better run replaces the player's old one
// instead of adding a second line to the ledger.
const entryId = (uid: string, difficulty: string) => `${uid}_${difficulty}`;

/** Returns true when this run beat the player's standing entry. */
export const submitLeaderboardScore = async (result: GameResult): Promise<boolean> => {
  const ref = doc(
    db,
    'leaderboard',
    result.gameType,
    'scores',
    entryId(result.uid, result.difficulty)
  );

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const previous = snap.exists() ? (snap.data() as LeaderboardEntry) : null;

    if (previous && previous.score >= result.score) {
      // Keep the better run, but let a renamed player show their current name.
      if (previous.displayName !== result.displayName) {
        tx.update(ref, { displayName: result.displayName });
      }
      return false;
    }

    tx.set(ref, {
      uid: result.uid,
      displayName: result.displayName,
      score: result.score,
      moves: result.moves,
      timeSeconds: result.timeSeconds,
      difficulty: result.difficulty,
      completedAt: serverTimestamp(),
    });
    return true;
  });
};

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
