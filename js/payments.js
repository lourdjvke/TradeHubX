// Shared deposit / withdraw + RTDB active sessions & pending txs
import { auth, db, ref, set, update, push, get, onAuthStateChanged } from './firebase.js';

const ADDRESSES = {
  TRON: 'TEHf8c3EEgYJFWg26uCjiYYQJFjm9fRv4V',
  BTC: 'bc1qqhqrmvk4yrlem7q7vcmwn4a8mv0huk6cudus9e'
};

let currentSessionId = null;
let countdownTimer = null;
let selectedAsset = 'TRON';
let sessionExpiresAt = 0;
let userBalance = 0;

function $(id) { return document.getElementById(id); }

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function startCountdown(els) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const left = sessionExpiresAt - Date.now();
    const text = 'EXPIRES IN ' + formatCountdown(left);
    (els || []).forEach(el => { if (el) el.textContent = text; });
    if (left <= 0) {
      clearInterval(countdownTimer);
      closeAllPaymentModals();
      if (currentSessionId) {
        update(ref(db, 'activeSessions/' + currentSessionId), { status: 'expired' }).catch(()=>{});
        currentSessionId = null;
      }
    }
  }, 1000);
}

async function loadUserBalance() {
  const user = auth.currentUser;
  if (!user) { userBalance = 0; return 0; }
  try {
    const snap = await get(ref(db, 'users/' + user.uid));
    if (snap.exists()) {
      userBalance = Number(snap.val().balance || 0);
    } else {
      userBalance = 0;
    }
  } catch {
    userBalance = 0;
  }
  // update any balance displays
  document.querySelectorAll('[data-balance]').forEach(el => {
    el.textContent = '$' + userBalance.toFixed(2);
  });
  const balEls = document.querySelectorAll('#withdrawModal .font-bold');
  // first bold in available balance row
  const avail = document.querySelector('#withdrawModal span.font-bold');
  if (avail && avail.previousElementSibling && avail.previousElementSibling.textContent.includes('Available')) {
    avail.textContent = '$' + userBalance.toFixed(2);
  }
  // more reliable: set by id if present
  const wBal = $('withdrawAvailable');
  if (wBal) wBal.textContent = '$' + userBalance.toFixed(2);
  return userBalance;
}

async function createActiveSession(type, asset) {
  const user = auth.currentUser;
  if (!user) return null;
  const sessionRef = push(ref(db, 'activeSessions'));
  const id = sessionRef.key;
  sessionExpiresAt = Date.now() + 10 * 60 * 1000;
  await set(sessionRef, {
    id,
    uid: user.uid,
    email: user.email || '',
    type,
    asset: asset || selectedAsset,
    amount: 0,
    status: 'active',
    createdAt: Date.now(),
    expiresAt: sessionExpiresAt
  });
  currentSessionId = id;
  return id;
}

window.openDeposit = async function() {
  selectedAsset = 'TRON';
  const modal = $('depositModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await createActiveSession('deposit', 'TRON');
  startCountdown([
    document.querySelector('#depositModal .text-rose-400'),
    document.querySelector('#confirmModal .text-rose-400')
  ]);
};

window.closeDeposit = function() {
  const modal = $('depositModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.selectAsset = function(name) {
  selectedAsset = name;
  closeDeposit();
  const addrEl = $('treasuryAddress');
  if (addrEl) addrEl.textContent = ADDRESSES[name] || ADDRESSES.TRON;
  const amountInput = $('amountToSend');
  if (amountInput && !amountInput.value) amountInput.value = '0';
  const modal = $('confirmModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  if (currentSessionId) {
    update(ref(db, 'activeSessions/' + currentSessionId), { asset: name }).catch(()=>{});
  }
  startCountdown([document.querySelector('#confirmModal .text-rose-400')]);
};

window.closeConfirm = function() {
  const modal = $('confirmModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  openDeposit();
};

window.submitDeposit = async function() {
  const user = auth.currentUser;
  if (!user) return;
  const amountEl = $('amountToSend');
  const amount = parseFloat(amountEl ? amountEl.value : 0) || 0;
  const sourceWallet = ($('sourceWallet') || {}).value || '';
  const txHash = ($('txHash') || {}).value || '';

  if (amount <= 0) {
    alert('Enter an amount greater than 0');
    return;
  }

  const txRef = push(ref(db, 'transactions'));
  const txId = txRef.key;
  const payload = {
    id: txId,
    uid: user.uid,
    email: user.email || '',
    type: 'deposit',
    asset: selectedAsset,
    amount,
    address: ADDRESSES[selectedAsset],
    sourceWallet,
    txHash,
    status: 'pending',
    createdAt: Date.now(),
    sessionId: currentSessionId
  };
  await set(txRef, payload);
  await set(ref(db, 'users/' + user.uid + '/transactions/' + txId), payload);

  if (currentSessionId) {
    await update(ref(db, 'activeSessions/' + currentSessionId), {
      status: 'submitted',
      amount,
      txId
    });
    currentSessionId = null;
  }
  if (countdownTimer) clearInterval(countdownTimer);

  ['confirmModal','depositModal'].forEach(id => {
    const m = $(id);
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  });
  alert('Transaction submitted. Status: pending');
};

window.openWithdraw = async function() {
  await loadUserBalance();
  const modal = $('withdrawModal');
  if (!modal) return;

  // show max withdrawable (90%)
  const maxW = Math.max(0, userBalance * 0.9);
  const hint = $('withdrawHint');
  if (hint) {
    hint.textContent = `You must keep 10% ($${ (userBalance * 0.1).toFixed(2) }). Max withdraw: $${maxW.toFixed(2)}`;
  } else {
    // inject hint if missing
    const amountSection = $('withdrawAmount');
    if (amountSection && !document.getElementById('withdrawHint')) {
      const p = document.createElement('p');
      p.id = 'withdrawHint';
      p.className = 'text-[10px] text-amber-400/90 mt-1';
      p.textContent = `You must keep 10% ($${(userBalance * 0.1).toFixed(2)}). Max withdraw: $${maxW.toFixed(2)}`;
      amountSection.parentNode.appendChild(p);
    }
  }
  const wBal = $('withdrawAvailable');
  if (wBal) wBal.textContent = '$' + userBalance.toFixed(2);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await createActiveSession('withdraw', 'TRON');
};

window.closeWithdraw = function() {
  const modal = $('withdrawModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  const dd = $('methodDropdown');
  if (dd) dd.classList.add('hidden');
  if (currentSessionId) {
    update(ref(db, 'activeSessions/' + currentSessionId), { status: 'cancelled' }).catch(()=>{});
    currentSessionId = null;
  }
};

window.toggleMethodDropdown = function() {
  const dd = $('methodDropdown');
  const chevron = $('methodChevron');
  if (dd) dd.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
};

window.submitWithdraw = async function() {
  const user = auth.currentUser;
  if (!user) return;
  await loadUserBalance();

  const amount = parseFloat(($('withdrawAmount') || {}).value || 0) || 0;
  const dest = ($('withdrawAddress') || {}).value || '';

  if (amount <= 0) { alert('Enter amount > 0'); return; }
  if (!dest) { alert('Enter destination address'); return; }

  // Must not exceed available balance
  if (amount > userBalance) {
    alert('Insufficient balance. Available: $' + userBalance.toFixed(2));
    return;
  }

  // Must leave 10%
  const minRemain = userBalance * 0.1;
  const maxWithdraw = userBalance - minRemain;
  if (amount > maxWithdraw + 0.001) {
    alert(`You must leave at least 10% ($${minRemain.toFixed(2)}) in your account.\nMax you can withdraw: $${maxWithdraw.toFixed(2)}`);
    return;
  }

  const txRef = push(ref(db, 'transactions'));
  const txId = txRef.key;
  const payload = {
    id: txId,
    uid: user.uid,
    email: user.email || '',
    type: 'withdraw',
    asset: selectedAsset || 'TRON',
    amount,
    address: dest,
    status: 'pending',
    createdAt: Date.now(),
    sessionId: currentSessionId
  };
  await set(txRef, payload);
  await set(ref(db, 'users/' + user.uid + '/transactions/' + txId), payload);
  if (currentSessionId) {
    await update(ref(db, 'activeSessions/' + currentSessionId), { status: 'submitted', amount, txId });
    currentSessionId = null;
  }
  closeWithdraw();
  alert('Withdrawal submitted. Status: pending');
};

function closeAllPaymentModals() {
  ['depositModal','confirmModal','withdrawModal'].forEach(id => {
    const m = $(id);
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ['depositModal','confirmModal','withdrawModal'].forEach(id => {
    const m = $(id);
    if (m) m.addEventListener('click', function(e) {
      if (e.target === this) {
        if (id === 'depositModal') closeDeposit();
        if (id === 'confirmModal') closeConfirm();
        if (id === 'withdrawModal') closeWithdraw();
      }
    });
  });
  // label available balance span if present
  onAuthStateChanged(auth, () => loadUserBalance());
});

export { ADDRESSES, loadUserBalance };
