import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, push, increment, onChildAdded, onValue, remove } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAS2aPX-Ywz9C60g6bJlLxgA0JZFybO3u8",
  authDomain: "tradexxxhub.firebaseapp.com",
  databaseURL: "https://tradexxxhub-default-rtdb.firebaseio.com",
  projectId: "tradexxxhub",
  storageBucket: "tradexxxhub.firebasestorage.app",
  messagingSenderId: "735259448264",
  appId: "1:735259448264:web:4d381a9d16592b3ee126fd",
  measurementId: "G-3E6Q440VM0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { 
  app, auth, db, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut, updateProfile,
  ref, set, get, update, push, increment, onChildAdded, onValue, remove
};
