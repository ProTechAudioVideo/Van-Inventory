// js/packout.js
// Lock/Unlock view, qty|status|length items, add-item popover chooser,
// per-item type cycle (keeps prior values), inline folder rename, expand/collapse.

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

// Add-item popover
let openPopover = null;
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
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
  requestAnimationFrame(() => {
    pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
  });
  const onDocClick = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closePopover(); };
  document.addEventListener('click', onDocClick, { capture: true });
  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('.popover-item');
    if (!btn) return;
    onPick(btn.dataset.kind);
    closePopover();
  });
  openPopover = { pop, onDocClick };
}
function closePopover() {
  if (openPopover) {
    document.removeEventListener('click', openPopover.onDocClick, { capture: true });
    openPopover.pop.remove();
    openPopover = null;
  }
}

// ===== Inline rename helpers =====
function startRenameFolder(folderId, folderData, titleSpan) {
  if (locked) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-title-input';
  input.value = folderData.name || '';
  input.setAttribute('aria-label', 'Edit folder name');

  titleSpan.style.display = 'none';
  titleSpan.insertAdjacentElement('afterend', input);
  input.focus(); input.select();

  const cleanup = () => { input.remove(); titleSpan.style.display = ''; };

  const commit = async () => {
    const newName = (input.value || '').trim();
    const oldName = (folderData.name || '').trim();
    if (!newName) { cleanup(); return; }
    if (newName === oldName) { cleanup(); return; }

    const all = await loadAll();
    const dup = Object.entries(all).some(([id, f]) =>
      id !== folderId && (f?.name || '').trim().toLowerCase() === newName.toLowerCase()
    );
    if (dup) { alert('That folder name is already in use.'); input.focus(); input.select(); return; }

    const newId = slugify(newName);
    try {
      if (newId === folderId) {
        await ensureFolder(folderId, { name: newName });
      } else {
        const payload = { ...folderData, name: newName };
        await setDoc(doc(colRef, newId), payload, { merge: false });
        await deleteDoc(doc(colRef, folderId));
        if (getCollapsed(folderId)) setCollapsed(newId, true);
        localStorage.removeItem(collapseKey(folderId));
      }
    } catch (e) {
      console.error('Rename failed:', e);
    } finally {
      cleanup();
      await init();
    }
  };

  const cancel = () => cleanup();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

// ===== Render =====
function render(data) {
  setLockUI();
  container.innerHTML = '';

  Object.entries(data).forEach(([folderId, folder]) => {
    const isCollapsed = getCollapsed(folderId);

    // Header
    const header = document.createElement('div');
    header.className = 'folder' + (isCollapsed ? ' collapsed' : '');

    const caret = document.createElement('button');
    caret.className = 'caret';
    caret.setAttribute('aria-label', isCollapsed ? 'Expand folder' : 'Collapse folder');
    caret.setAttribute('aria-expanded', (!isCollapsed).toString());
    caret.textContent = isCollapsed ? '▸' : '▾';
    header.appendChild(caret);

    const title = document.createElement('span');
    title.className = 'folder-title' + (!locked ? ' editable' : '');
    title.textContent = folder.name || '(untitled)';
    header.appendChild(title);

    if (!locked) {
      title.title = 'Click to rename';
      title.addEventListener('click', (e) => { e.stopPropagation(); startRenameFolder(folderId, folder, title); });
    } else {
      title.addEventListener('click', () => toggleCollapse());
    }

    // Add item / delete folder (only unlocked)
    let addItemBtn = null;
    if (!locked) {
      addItemBtn = document.createElement('button');
      addItemBtn.textContent = '+';
      addItemBtn.title = 'Add item';
      addItemBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        showAddPopover(addItemBtn, async (kind) => {
          const items = Array.isArray(folder.items) ? folder.items.slice() : [];
          if (kind === 'status')      items.push({ kind: 'status', name: '' });
          else if (kind === 'length') items.push({ kind: 'length', name: '' });        // lengthFt unset (shows —)
          else                        items.push({ kind: 'qty',    name: '', qty: 0 }); // default qty 0
          await saveItems(folderId, items);
          await init();
        });
      });
      header.appendChild(addItemBtn);

      const delFolderBtn = document.createElement('button');
      delFolderBtn.textContent = 'Delete';
      delFolderBtn.className = 'delete-btn';
      delFolderBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this folder and all its items?')) {
          await deleteFolder(folderId);
          await init();
        }
      });
      header.appendChild(delFolderBtn);
    }

    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'folder-items';
    list.style.display = isCollapsed ? 'none' : '';
    container.appendChild(list);

    function toggleCollapse() {
      const newCollapsed = list.style.display !== 'none';
      list.style.display = newCollapsed ? 'none' : '';
      header.classList.toggle('collapsed', newCollapsed);
      caret.textContent = newCollapsed ? '▸' : '▾';
      caret.setAttribute('aria-label', newCollapsed ? 'Expand folder' : 'Collapse folder');
      caret.setAttribute('aria-expanded', (!newCollapsed).toString());
      setCollapsed(folderId, newCollapsed);
      closePopover();
    }
    caret.addEventListener('click', toggleCollapse);

    const items = Array.isArray(folder.items) ? folder.items.slice() : [];

    const normalizeKind = (item) => {
      if (item.kind === 'qty' || item.kind === 'status' || item.kind === 'length') return item.kind;
      if (STATUS_ORDER.includes(item.status)) return 'status';
      if (typeof item.lengthFt === 'number')  return 'length';
      return 'qty';
    };

    const pushRow = (item, index) => {
      const kind = normalizeKind(item);
      const statusActive = STATUS_ORDER.includes(item.status) ? item.status : null;

      const row = document.createElement('div');
      row.className = 'row';

      // Main line
      const main = document.createElement('div');
      main.className = 'row-main';

      if (!locked) {
        const delBtn = document.createElement('button');
