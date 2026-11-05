// Auth guard + user initials — waits for Firebase auth restore before redirecting
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

let resolved = false;
onAuthStateChanged(auth, (user) => {
  resolved = true;
  if (!user) {
    // Protected pages only — redirect to auth (not landing)
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (page && page !== 'auth.html' && page !== 'index.html' && page !== '' && page !== 'admin.html') {
      window.location.replace('auth.html');
    }
    return;
  }
  window.currentUser = user;
  const initials = getInitials(user);

  document.querySelectorAll('[data-user-initials]').forEach(el => {
    el.textContent = initials;
  });
  document.querySelectorAll('.rounded-full').forEach(el => {
    if (el.textContent.trim() === 'BK' || el.hasAttribute('data-user-initials')) {
      el.textContent = initials;
    }
  });
});

window.handleLogout = async function() {
  try {
    await signOut(auth);
  } catch (e) {}
  window.location.href = 'auth.html';
};

window.getUserInitials = getInitials;
