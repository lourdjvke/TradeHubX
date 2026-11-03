// Floating chat widget – works on all pages, persists via IndexedDB + RTDB
import { db, ref, set, push, onChildAdded, update, get } from './firebase.js';

const CHAT_DB = 'tradexal_chat';
const CHAT_STORE = 'visitor';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CHAT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHAT_STORE)) db.createObjectStore(CHAT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getVisitorId() {
  try {
    const idb = await openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(CHAT_STORE, 'readonly');
      const req = tx.objectStore(CHAT_STORE).get('visitorId');
      req.onsuccess = () => {
        if (req.result) resolve(req.result);
        else createVisitorId().then(resolve);
      };
      req.onerror = () => createVisitorId().then(resolve);
    });
  } catch {
    return createVisitorId();
  }
}

async function createVisitorId() {
  const id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    const idb = await openIDB();
    const tx = idb.transaction(CHAT_STORE, 'readwrite');
    tx.objectStore(CHAT_STORE).put(id, 'visitorId');
  } catch {}
  localStorage.setItem('tradexal_visitorId', id);
  // ensure RTDB chat room exists
  await set(ref(db, 'chats/' + id + '/meta'), {
    visitorId: id,
    createdAt: Date.now(),
    lastMessageAt: Date.now(),
    status: 'open'
  }).catch(()=>{});
  return id;
}

let visitorId = null;
let chatExpanded = false;
let unsub = null;

async function initChat() {
  visitorId = localStorage.getItem('tradexal_visitorId') || await getVisitorId();
  localStorage.setItem('tradexal_visitorId', visitorId);

  // ensure room
  const metaSnap = await get(ref(db, 'chats/' + visitorId + '/meta'));
  if (!metaSnap.exists()) {
    await set(ref(db, 'chats/' + visitorId + '/meta'), {
      visitorId,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      status: 'open'
    });
  }

  injectWidget();
  listenMessages();
}

function injectWidget() {
  // Remove any previous instance (prevents double bubbles)
  document.querySelectorAll('#txChatRoot, #txChatFab, #txChatFabWrap, #txChatWelcome, #txChatPanel').forEach(el => el.remove());
  // Also strip leftover page-level chat FABs if any slipped through
  document.querySelectorAll('button.relative.w-14.h-14.rounded-full').forEach(btn => {
    if (btn.closest('#txChatRoot')) return;
    const parent = btn.parentElement;
    if (parent && /fixed/.test(parent.className) && /bottom/.test(parent.className)) {
      parent.remove();
    }
  });

  const root = document.createElement('div');
  root.id = 'txChatRoot';
  root.style.cssText = 'position:relative;z-index:60;';
  root.innerHTML = `
    <div id="txChatPanel" style="position:fixed;right:1rem;bottom:5.5rem;left:auto;z-index:60;" class="w-[320px] max-h-[70vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden hidden">
      <div class="bg-[#5b5fcf] text-white px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">T</div>
          <div>
            <p class="text-sm font-semibold">Support</p>
            <p class="text-[10px] text-white/70">Usually replies instantly</p>
          </div>
        </div>
        <button id="txChatClose" class="p-1 hover:bg-white/10 rounded">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div id="txChatMessages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-[200px] max-h-[340px]"></div>
      <div class="p-3 border-t border-gray-100 bg-white flex gap-2">
        <input id="txChatInput" type="text" placeholder="Type a message..." class="flex-1 px-3 py-2 rounded-full border border-gray-200 text-sm outline-none focus:border-[#5b5fcf] text-gray-800">
        <button id="txChatSend" class="w-10 h-10 rounded-full bg-[#5b5fcf] text-white flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>

    <div id="txChatWelcome" style="position:fixed;right:1rem;bottom:5.5rem;left:auto;z-index:60;" class="w-72 bg-white rounded-2xl shadow-2xl overflow-hidden hidden">
      <div class="p-4">
        <div class="flex items-start justify-between mb-3">
          <div class="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <button id="txWelcomeClose" class="text-gray-400 hover:text-gray-600 p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="text-sm text-gray-700 leading-relaxed mb-4">
          Welcome to tradexxalpro. 👋 Need assistance with a transaction or have a specific question about your portfolio? We're here to help you navigate the platform. How can we assist you today?
        </p>
        <button id="txLetsChat" class="w-full py-2.5 bg-[#5b5fcf] text-white rounded-full text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#4a4ec0] transition">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Let's chat
        </button>
      </div>
    </div>

    <div id="txChatFabWrap" style="position:fixed;right:1rem;bottom:1.25rem;left:auto;z-index:60;">
      <button id="txChatFab" class="relative w-14 h-14 rounded-full bg-[#5b5fcf] shadow-lg shadow-indigo-500/30 flex items-center justify-center active:scale-95 transition">
        <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <span class="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ">1</span>
      </button>
    </div>
  `;
  document.body.appendChild(root);

  // events
  document.getElementById('txChatFab').onclick = () => {
    if (chatExpanded) {
      document.getElementById('txChatPanel').classList.add('hidden');
      chatExpanded = false;
    } else {
      document.getElementById('txChatWelcome').classList.remove('hidden');
    }
  };
  document.getElementById('txWelcomeClose').onclick = () => {
    document.getElementById('txChatWelcome').classList.add('hidden');
  };
  document.getElementById('txLetsChat').onclick = () => {
    document.getElementById('txChatWelcome').classList.add('hidden');
    document.getElementById('txChatPanel').classList.remove('hidden');
    chatExpanded = true;
    scrollChat();
  };
  document.getElementById('txChatClose').onclick = () => {
    document.getElementById('txChatPanel').classList.add('hidden');
    chatExpanded = false;
  };
  document.getElementById('txChatSend').onclick = sendMessage;
  document.getElementById('txChatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

function scrollChat() {
  const box = document.getElementById('txChatMessages');
  if (box) box.scrollTop = box.scrollHeight;
}

function appendMsg(msg) {
  const box = document.getElementById('txChatMessages');
  if (!box) return;
  const mine = msg.from === 'user';
  const div = document.createElement('div');
  div.className = 'flex ' + (mine ? 'justify-end' : 'justify-start');
  div.innerHTML = `<div class="max-w-[80%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-[#5b5fcf] text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'}">${escapeHtml(msg.text)}</div>`;
  box.appendChild(div);
  scrollChat();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function listenMessages() {
  if (!visitorId) return;
  const msgsRef = ref(db, 'chats/' + visitorId + '/messages');
  onChildAdded(msgsRef, (snap) => {
    appendMsg(snap.val());
  });
}

async function sendMessage() {
  const input = document.getElementById('txChatInput');
  const text = (input.value || '').trim();
  if (!text || !visitorId) return;
  input.value = '';
  const msgRef = push(ref(db, 'chats/' + visitorId + '/messages'));
  await set(msgRef, {
    id: msgRef.key,
    text,
    from: 'user',
    at: Date.now()
  });
  await update(ref(db, 'chats/' + visitorId + '/meta'), {
    lastMessageAt: Date.now(),
    lastMessage: text,
    status: 'open'
  });
}

// boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChat);
} else {
  initChat();
}
