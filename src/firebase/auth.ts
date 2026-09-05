import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './config';
import { createUserProfile } from './firestore';
import { isDisposableEmail } from '../utils/emailUtils';

const googleProvider = new GoogleAuthProvider();

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const registerWithEmail = async (
  email: string,
  password: string,
  displayName: string
) => {
  if (isDisposableEmail(email)) {
    throw new Error(
      'That looks like a temporary inbox. Please sign the register with a permanent email address.'
    );
  }
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName });
  await createUserProfile(user, displayName, password);
  return user;
};

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  await createUserProfile(result.user, result.user.displayName || 'Player');
  return result.user;
};

export const logout = () => signOut(auth);

export type { User };
