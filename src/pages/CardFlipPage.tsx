import { useSearchParams, useNavigate } from 'react-router-dom';
import CardFlipGame from '../games/card-flip/CardFlipGame';
import type { Difficulty, CardTheme } from '../types/game.types';

const VALID_DIFFICULTIES: Difficulty[] = ['4x4', '6x6', '8x8'];
const VALID_THEMES: CardTheme[] = ['colors', 'emojis', 'numbers', 'animals', 'symbols'];

export default function CardFlipPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const rawDifficulty = params.get('difficulty') as Difficulty;
  const rawTheme = params.get('theme') as CardTheme;

  const difficulty: Difficulty = VALID_DIFFICULTIES.includes(rawDifficulty) ? rawDifficulty : '4x4';
  const theme: CardTheme = VALID_THEMES.includes(rawTheme) ? rawTheme : 'emojis';

  return (
    <CardFlipGame
      difficulty={difficulty}
      theme={theme}
      onBack={() => navigate('/lobby')}
    />
  );
}
