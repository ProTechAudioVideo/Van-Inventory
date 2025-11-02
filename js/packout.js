// js/packout.js
// Lock/Unlock view, qty|status|length items, add-item popover chooser,
// per-item type cycle (keeps prior values), inline folder rename, expand/collapse,
// and status picker dropdown (replaces 4 inline buttons).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

/* Firebase config — project: protech-van-inventory-2025 */
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.appspot.com",
  appId: "1:818777808639:web:demo"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// DOM refs
const addFolderBtn  = document.getElementById('add-folder');
const downloadBtn   = document.getElementById('download-json');
const toggleLockBtn = document.getElementById('toggle-lock');
const container =
  document.getElementById('packout-container') ||
  document.getElementById('page-container');

if (!container) throw new Error('Missing container: <div id="packout-container"> or id="page-container".');

// Page/collection key
const pageKey = (document.body?.dataset?.packout) ||
  (document.title || 'packout').toLowerCase().replace(/\s+/g, '-');

const colRef = collection(db, pageKey);

// Collapse state (local only)
const collapseKey   = (id) => `packout:${pageKey}:collapsed:${id}`;
const getCollapsed  = (id) => localStorage.getItem(collapseKey(id)) === '1';
const setCollapsed  = (id, val) => { if (val) localStorage.setItem(collapseKey(id), '1'); else localStorage.removeItem(collapseKey(id)); };

// Lock state: default LOCKED, no persistence
let locked = true;
function setLockUI() {
  document.body.classList.toggle('locked', locked);
  if (toggleLockBtn) {
    toggleLockBtn.textContent = locked ? 'Unlock' : 'Lock';
    toggleLockBtn.setAttribute('aria-pressed', (!locked).toString());
    toggleLockBtn.setAttribute('aria-label', locked ? 'Unlock editing' : 'Lock view');
  }
  if (addFolderBtn) addFolderBtn.style.display = locked ? 'none' : '';
}

// Helpers
const STATUS_ORDER = ['empty', 'low', 'mid', 'full'];
const STATUS_LABEL = { empty: 'Empty', low: 'Low', mid: 'Mid', full: 'Full' };

const KIND_ORDER = ['qty', 'status', 'length'];
const KIND_LABEL = { qty: 'Qty', status: 'Status', length: 'Length' };
const nextKind = (k) => KIND_ORDER[(KIND_ORDER.indexOf(k) + 1) % KIND_ORDER.length];

const slugify = (s) => (s || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '') || ('folder-' + Date.now());

// Firestore helpers
async function loadAll() {
  const out = {};
  const snap = await getDocs(colRef);
  snap.forEach(d => out[d.id] = d.data());
  return out;
}
async function ensureFolder(id, data) { await setDoc(doc(colRef, id), data, { merge: true }); }
async function saveItems(folderId, items) { await updateDoc(doc(colRef, folderId), { items }); }
async function deleteFolder(folderId) { await deleteDoc(doc(colRef, folderId)); }

// ===== Generic popover infra (re-used by add-item and status picker) =====
let openPopover = null;

function attachPopover(pop, anchorEl, onDocClick) {
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
  requestAnimationFrame(() => {
    pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
  });
  document.addEventListener('click', onDocClick, { capture: true });
  openPopover = { pop, onDocClick };
}

function closePopover() {
  if (openPopover) {
    document.removeEventListener('click', openPopover.onDocClick, { capture: true });
    openPopover.pop.remove();
    openPopover = null;
  }
}

function showAddPopover(anchorEl, onPick) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.role = 'dialog';
  pop.innerHTML = `
    <button class="popover-item" data-kind="qty">➕ Quantity item</button>
    <button class="popover-item" data-kind="status">🏷️ Status item</button>
    <button class="popover-item" data-kind="length">📏 Length item</button>
  `;
  const onDocClick = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closePopover(); };
  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('.popover-item');
    if (!btn) return;
    onPick(btn.dataset.kind);
    closePopover();
  });
  attachPopover(pop, anchorEl, onDocClick);
}

// NEW: status picker dropdown
function showStatusPopover(anchorEl, current, onSelect) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.role = 'listbox';
  pop.innerHTML = `
    <button class="popover-item" data-value="none">— None</button>
    <button class="popover-item" data-value="empty">Empty</button>
    <button class="popover-item" data-
