export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  password?: string;
  photoURL?: string;
  createdAt: number;
  totalGamesPlayed: number;
  totalWins: number;
  highScores: Record<string, number>; // gameType -> best score
}
