// Live balance / portfolio numbers from RTDB
import { auth, db, ref, onValue, onAuthStateChanged } from './firebase.js';

function money(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  onValue(ref(db, 'users/' + user.uid), (snap) => {
    const d = snap.val() || {};
    const balance = Number(d.balance || 0);
    const invested = Number(d.invested || 0);
    const accrued = Number(d.accrued || 0);
    const net = balance + invested + accrued;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('netWorth', money(net));
    set('ledgerBalance', money(balance));
    set('activeInvestments', money(invested));
    set('totalPrincipal', money(invested));
    set('totalAccrued', '+' + money(accrued));
    set('withdrawAvailable', money(balance));

    // any element marked data-balance
    document.querySelectorAll('[data-balance]').forEach(el => {
      el.textContent = money(balance);
    });
  });

  // investments list for portfolio empty state
  onValue(ref(db, 'users/' + user.uid + '/investments'), (snap) => {
    const box = document.getElementById('investmentsList');
    if (!box) return;
    const data = snap.val() || {};
    const list = Object.values(data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) {
      box.innerHTML = '<p class="text-center py-6 text-white/30 text-sm">No active deployments found.</p>';
      return;
    }
    box.innerHTML = list.map(inv => `
      <div class="flex justify-between items-center py-3 border-b border-white/5 text-sm">
        <div>
          <p class="font-medium">${inv.plan || 'Plan'}</p>
          <p class="text-xs text-white/40">${new Date(inv.createdAt || 0).toLocaleDateString()}</p>
        </div>
        <div class="text-right">
          <p class="font-bold">${money(inv.amount)}</p>
          <p class="text-xs text-emerald-400">+${money(inv.returns || 0)}</p>
        </div>
      </div>
    `).join('');
  });
});
