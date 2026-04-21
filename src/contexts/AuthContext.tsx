import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCredential } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  googleAccessToken: string | null;
  syncTrigger: number;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  triggerSync: () => void;
  clearToken: () => void;
  connectCalendar: () => Promise<void>;
  clearCalendarAccess: () => Promise<void>;
  hasCalendarAccess: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => localStorage.getItem('googleAccessToken'));
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      if (currentUser) {
        // Check if user has refresh token in Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().calendarRefreshToken) {
          setHasCalendarAccess(true);
        }
      } else {
        setHasCalendarAccess(false);
      }
    });

    return unsubscribe;
  }, []);

  // Auto sync every 15 minutes
  useEffect(() => {
    if (!user || !hasCalendarAccess) return;
    const interval = setInterval(() => {
      setSyncTrigger(prev => prev + 1);
    }, 15 * 60 * 1000); // 15 minutes
    return () => clearInterval(interval);
  }, [user, hasCalendarAccess]);

  const triggerSync = () => {
    setSyncTrigger(prev => prev + 1);
  };

  const clearToken = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem('googleAccessToken');
  };

  const clearCalendarAccess = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        calendarRefreshToken: null
      }, { merge: true });
      setHasCalendarAccess(false);
    } catch (error) {
      console.error("Error clearing calendar access", error);
    }
  };

  const connectCalendar = async () => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/auth/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const text = await response.text();
      let url = "";
      try {
        if (!text.trim().startsWith('<!') && !text.trim().startsWith('<html')) {
           url = JSON.parse(text).url;
        } else {
           throw new Error("Received HTML response from server. Session may be expired.");
        }
      } catch (e: any) {
        throw new Error("Failed to parse auth URL response.");
      }

      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      
      if (!authWindow) {
        alert('Please allow popups for this site to connect your calendar.');
        return;
      }

      return new Promise<void>((resolve, reject) => {
        const handleMessage = async (event: MessageEvent) => {
          if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) return;
          
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            const tokens = event.data.tokens;
            
            if (tokens.refresh_token) {
              const userRef = doc(db, 'users', user.uid);
              await setDoc(userRef, {
                calendarRefreshToken: tokens.refresh_token
              }, { merge: true });
              setHasCalendarAccess(true);
              triggerSync();
              resolve();
            } else {
              reject(new Error('No refresh token received. Please revoke access in your Google Account and try again.'));
            }
          }
        };
        window.addEventListener('message', handleMessage);
      });
    } catch (error) {
      console.error('Error connecting calendar:', error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
      googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
      googleProvider.addScope('https://www.googleapis.com/auth/documents');
      
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
      
      // Set to true because they just granted via popup
      if (credential?.accessToken) {
        setHasCalendarAccess(true);
        triggerSync();
      }
    } catch (error: any) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error("Error signing in with email", error);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, password: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      // Persist user in Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: email.split('@')[0], // Default display name
        photoURL: null,
        createdAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error("Error registering with email", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      setHasCalendarAccess(false);
      localStorage.removeItem('googleAccessToken');
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, googleAccessToken, syncTrigger, signInWithGoogle, signInWithEmail, registerWithEmail, logout, triggerSync, clearToken, connectCalendar, clearCalendarAccess, hasCalendarAccess }}>
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
