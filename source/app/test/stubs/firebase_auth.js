// Test stand-in for firebase/auth
const nop = () => {};
export function getAuth() { return { currentUser: globalThis.__authUser || null }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(a.currentUser), 0); return nop; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const signInWithPopup = async () => {}, signInWithRedirect = async () => {}, getRedirectResult = async () => null, signInWithEmailAndPassword = async () => {},
  createUserWithEmailAndPassword = async () => ({ user: {} }), sendPasswordResetEmail = async () => {}, signOut = async () => {}, updateProfile = async () => {}, sendEmailVerification = async () => {},
  setPersistence = async () => {}, indexedDBLocalPersistence = {}, browserLocalPersistence = {};
