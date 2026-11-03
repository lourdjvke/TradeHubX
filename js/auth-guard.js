// Auth guard + user initials
import { auth, onAuthStateChanged, signOut } from './firebase.js';

function getInitials(user) {
  if (!user) return '??';
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  const local = (user.email || '').split('@')[0];
  return local.substring(0, 2).toUpperCase() || '??';
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  window.currentUser = user;
  const initials = getInitials(user);

  // Prefer data-user-initials
  document.querySelectorAll('[data-user-initials]').forEach(el => {
    el.textContent = initials;
  });
  // Fallback: any element that still says BK inside rounded-full
  document.querySelectorAll('.rounded-full').forEach(el => {
    if (el.textContent.trim() === 'BK') el.textContent = initials;
  });
});

window.handleLogout = async function() {
  try {
    await signOut(auth);
  } catch (e) {}
  window.location.href = 'index.html';
};

window.getUserInitials = getInitials;
