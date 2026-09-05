import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
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

/* Where the reset link sends people afterwards. The link itself only lands
   on our /auth/action page once the Firebase console's action URL points
   there; until then Firebase's hosted page handles it. */
const actionCodeSettings = () => ({
  url: `${window.location.origin}/login`,
  handleCodeInApp: false,
});

const friendlyAuthError = (err: unknown): Error => {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/invalid-email':
      return new Error('That email address does not look right.');
    case 'auth/too-many-requests':
      return new Error('Too many attempts. Please wait a little while and try again.');
    case 'auth/expired-action-code':
      return new Error('This reset link has expired. Please request a fresh one.');
    case 'auth/invalid-action-code':
      return new Error('This reset link is not valid. It may already have been used.');
    case 'auth/weak-password':
      return new Error('That password is too weak. Use at least 6 characters.');
    default:
      return err instanceof Error ? err : new Error('Something went wrong. Please try again.');
  }
};

/* Sends Firebase's reset link to the address. A missing account is treated
   like a sent mail so the door never confirms who holds a membership. */
export const sendPasswordReset = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email, actionCodeSettings());
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'auth/user-not-found') return;
    throw friendlyAuthError(err);
  }
};

/* Checks the code from a reset link and returns the account's email. */
export const checkPasswordResetCode = async (code: string) => {
  try {
    return await verifyPasswordResetCode(auth, code);
  } catch (err: unknown) {
    throw friendlyAuthError(err);
  }
};

/* Applies the new password against a verified reset code. */
export const completePasswordReset = async (code: string, newPassword: string) => {
  try {
    await confirmPasswordReset(auth, code, newPassword);
  } catch (err: unknown) {
    throw friendlyAuthError(err);
  }
};

export type { User };
