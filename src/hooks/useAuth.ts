import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserProfile } from '../firebase/firestore';
import { useAuthStore } from '../store/authStore';

export const useAuthInit = () => {
  const { setUser, setProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setUser(user);
        const profile = await getUserProfile(user.uid);
        setProfile(profile);
      } else {
        reset();
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
};

export const useAuth = () => {
  const { user, profile, loading } = useAuthStore();
  return { user, profile, loading, isAuthenticated: !!user };
};
