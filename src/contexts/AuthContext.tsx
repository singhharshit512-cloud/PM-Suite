import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  googleAccessToken: string | null;
  syncTrigger: number;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  triggerSync: () => void;
  clearToken: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => localStorage.getItem('googleAccessToken'));
  const [syncTrigger, setSyncTrigger] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Auto sync every hour
  useEffect(() => {
    if (!user || !googleAccessToken) return;
    const interval = setInterval(() => {
      setSyncTrigger(prev => prev + 1);
    }, 60 * 60 * 1000); // 1 hour
    return () => clearInterval(interval);
  }, [user, googleAccessToken]);

  const triggerSync = () => {
    setSyncTrigger(prev => prev + 1);
  };

  const clearToken = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem('googleAccessToken');
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        localStorage.setItem('googleAccessToken', credential.accessToken);
      }
      
      const user = result.user;
      
      // Persist user in Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      localStorage.removeItem('googleAccessToken');
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, googleAccessToken, syncTrigger, signInWithGoogle, logout, triggerSync, clearToken }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
