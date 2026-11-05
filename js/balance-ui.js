// Live balance / portfolio / history from RTDB
import { auth, db, ref, onValue, get, onAuthStateChanged } from './firebase.js';

function money(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function applyUserData(d) {
  d = d || {};
  // Support both current and any legacy field names
  const balance = Number(d.balance ?? d.ledger ?? d.ledgerBalance ?? 0);
  const invested = Number(d.invested ?? d.activeInvestments ?? 0);
  const accrued = Number(d.accrued ?? d.returns ?? 0);
  const net = balance + invested + accrued;

  setText('netWorth', money(net));
  setText('ledgerBalance', money(balance));
  setText('activeInvestments', money(invested));
  setText('totalPrincipal', money(invested));
  setText('totalAccrued', '+' + money(accrued));
  setText('withdrawAvailable', money(balance));
  setText('stakeBalance', money(balance));

  document.querySelectorAll('[data-balance]').forEach(el => {
    el.textContent = money(balance);
  });

  window.__userBalance = balance;
  window.__userInvested = invested;
}

function renderTxList(boxId, data) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const list = Object.values(data || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) {
    box.innerHTML = '<p class="text-white/30 text-sm">No ledger activity found.</p>';
    return;
  }
  box.innerHTML = list.map(t => {
    const d = new Date(t.createdAt || 0).toLocaleString();
    const st = t.status || '';
    const stLabel = (st === 'rejected' || st === 'declined') ? 'Declined' : st;
    const stClass = st === 'pending' ? 'text-amber-400'
      : st === 'approved' ? 'text-emerald-400'
      : (st === 'rejected' || st === 'declined') ? 'text-rose-400'
      : st === 'reversed' ? 'text-orange-400' : 'text-white/40';
    return `<div class="flex justify-between items-center py-2 border-b border-white/5 text-sm">
      <div>
        <p class="font-medium capitalize">${t.type || ''} · ${t.asset || ''}</p>
        <p class="text-xs text-white/40">${d} · ${(t.id || '').toString().slice(0, 8)}…</p>
      </div>
      <div class="text-right">
        <p class="font-bold">${money(t.amount)}</p>
        <p class="text-[10px] uppercase ${stClass}">${stLabel}</p>
      </div>
    </div>`;
  }).join('');
}

function renderInvestments(data) {
  const box = document.getElementById('investmentsList');
  if (!box) return;
  const list = Object.values(data || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
}

function bindUser(uid) {
  // Profile / balances
  onValue(ref(db, 'users/' + uid), (snap) => {
    applyUserData(snap.val());
  }, (err) => {
    console.error('[balance-ui] users listener', err);
  });

  // One-shot refresh in case listener is delayed
  get(ref(db, 'users/' + uid)).then(snap => {
    if (snap.exists()) applyUserData(snap.val());
  }).catch(err => console.error('[balance-ui] users get', err));

  // Transactions history (wallet)
  onValue(ref(db, 'users/' + uid + '/transactions'), (snap) => {
    renderTxList('activityList', snap.val());
  }, (err) => console.error('[balance-ui] tx listener', err));

  // Also surface global transactions filtered by uid if user path empty
  onValue(ref(db, 'transactions'), (snap) => {
    const all = snap.val() || {};
    const mine = {};
    Object.entries(all).forEach(([id, t]) => {
      if (t && t.uid === uid) mine[id] = t;
    });
    const box = document.getElementById('activityList');
    if (!box) return;
    // Only fill from global if user node empty-looking
    const current = box.querySelectorAll('.font-medium').length;
    if (!current && Object.keys(mine).length) {
      renderTxList('activityList', mine);
    }
  }, () => {});

  // Investments
  onValue(ref(db, 'users/' + uid + '/investments'), (snap) => {
    renderInvestments(snap.val());
  }, (err) => console.error('[balance-ui] inv listener', err));
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn('[balance-ui] no user');
    return;
  }
  console.log('[balance-ui] binding', user.uid);
  bindUser(user.uid);
});
