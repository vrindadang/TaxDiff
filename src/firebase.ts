import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDDjruVNJFJQ8KS7Tu_6AQwdFtyq8vjQio",
  authDomain: "taxdiff-3b90f.firebaseapp.com",
  projectId: "taxdiff-3b90f",
  storageBucket: "taxdiff-3b90f.firebasestorage.app",
  messagingSenderId: "45655499882",
  appId: "1:45655499882:web:2ea8148b554358eb8ad613",
  measurementId: "G-9T57GYCJN4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function loadLibraryText(libraryKey: string, uid: string = 'global_user'): Promise<{ text: string; data: any }> {
  const libId = `${uid}_${libraryKey}`;
  const mainSnap = await getDoc(doc(db, 'libraries', libId));
  
  if (!mainSnap.exists()) {
    throw new Error("Library document not found");
  }
  
  const mainData = mainSnap.data();
  if (!mainData.chunked) {
    return { text: mainData.text || "", data: mainData };
  }
  
  // Reassemble chunks
  let fullText = "";
  const totalChunks = mainData.totalChunks;
  
  for (let c = 0; c < totalChunks; c++) {
    const chunkSnap = await getDoc(doc(db, 'libraries', `${libId}_chunk${c}`));
    if (chunkSnap.exists()) {
      fullText += chunkSnap.data().text || "";
    }
  }
  
  return { text: fullText, data: mainData };
}
