// Auth guard - include this on protected pages
import { auth, onAuthStateChanged, signOut } from './firebase.js';

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Not logged in → redirect to login
    window.location.href = 'index.html';
  } else {
    // Optional: expose user globally if needed
    window.currentUser = user;
  }
});

// Logout helper
window.handleLogout = async function() {
  try {
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (e) {
    console.error(e);
    window.location.href = 'index.html';
  }
};
