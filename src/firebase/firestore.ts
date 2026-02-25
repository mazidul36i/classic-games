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
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './config';
import type { UserProfile } from '../types/user.types';
import type { GameResult } from '../types/game.types';

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

  // Save to leaderboard collection
  await addDoc(collection(db, 'leaderboard', result.gameType, 'scores'), {
    uid: result.uid,
    displayName: result.displayName,
    score: result.score,
    moves: result.moves,
    timeSeconds: result.timeSeconds,
    difficulty: result.difficulty,
    completedAt: serverTimestamp(),
  });

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

export const getLeaderboard = async (
  gameType: string,
  difficulty?: string,
  count = 20
) => {
  let q = query(
    collection(db, 'leaderboard', gameType, 'scores'),
    orderBy('score', 'desc'),
    limit(count)
  );
  if (difficulty) {
    q = query(
      collection(db, 'leaderboard', gameType, 'scores'),
      where('difficulty', '==', difficulty),
      orderBy('score', 'desc'),
      limit(count)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
