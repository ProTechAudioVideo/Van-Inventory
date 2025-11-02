// js/packout.js
// Lock/Unlock view, qty|status|length items, add-item popover chooser,
// inline folder rename, expand/collapse, status dropdown,
// and long-press (0.25s) drag-to-reorder via a handle (touch + mouse).

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

function showStatusPopover(anchorEl, current, onSelect) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.role = 'listbox';
  pop.innerHTML = `
    <button class="popover-item" data-value="none">— None</button>
    <button class="popover-item" data-value="empty">Empty</button>
    <button class="popover-item" data-value="low">Low</button>
    <button class="popover-item" data-value="mid">Mid</button>
    <button class="popover-item" data-value="full">Full</button>
  `;
  pop.querySelectorAll('.popover-item').forEach(btn => {
    const v = btn.dataset.value;
    btn.classList.toggle('selected', v === current || (v === 'none' && !current));
  });

  const onDocClick = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closePopover(); };
  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('.popover-item');
    if (!btn) return;
    const v = btn.dataset.value;
    onSelect(v === 'none' ? null : v);
    closePopover();
  });
  attachPopover(pop, anchorEl, onDocClick);
}

// ===== Long-press drag-to-reorder (touch + mouse) =====
const DRAG_HOLD_MS = 250;     // 0.25 seconds
const MOVE_CANCEL_PX = 6;     // cancel long-press if finger moves too much

let dragState = null; // { folderId, items, listEl, rowEl, ghostEl, placeholderEl, startIndex, startY, offsetY, holdTimer }

function makeGhost(rowEl) {
  const r = rowEl.getBoundingClientRect();
  const ghost = rowEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  ghost.style.left = `${r.left + window.scrollX}px`;
  ghost.style.top  = `${r.top  + window.scrollY}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function makePlaceholder(rowEl) {
  const r = rowEl.getBoundingClientRect();
  const ph = document.createElement('div');
  ph.className = 'drag-placeholder';
  ph.style.height = `${r.height}px`;
  return ph;
}

function docY(e) {
  if (e.touches && e.touches[0]) return e.touches[0].clientY + window.scrollY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY + window.scrollY;
  return e.clientY + window.scrollY;
}

function onMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const y = docY(e) - dragState.offsetY;
  dragState.ghostEl.style.top = `${y}px`;

  const rows = Array.from(dragState.listEl.querySelectorAll(':scope > .row'))
    .filter(el => el !== dragState.rowEl);
  let insertBefore = null;
  const midY = y + dragState.ghostEl.offsetHeight / 2;

  for (const candidate of rows) {
    const cr = candidate.getBoundingClientRect();
    const cMid = cr.top + window.scrollY + cr.height / 2;
    if (midY < cMid) { insertBefore = candidate; break; }
  }

  if (insertBefore) {
    dragState.listEl.insertBefore(dragState.placeholderEl, insertBefore);
  } else {
    dragState.listEl.appendChild(dragState.placeholderEl);
  }
}

async function onUp(e) {
  if (!dragState) return;
  e.preventDefault();

  const children = Array.from(dragState.listEl.querySelectorAll(':scope > .row, :scope > .drag-placeholder'));
  const phIndex = children.indexOf(dragState.placeholderEl);

  dragState.ghostEl.remove();
  dragState.rowEl.style.visibility = '';
  dragState.placeholderEl.remove();

  const { folderId, items, startIndex } = dragState;
  dragState = null;

  if (phIndex < 0) return;

  const newIndex = phIndex;

  const moved = items[startIndex];
  const copy = items.slice();
  copy.splice(startIndex, 1);
  copy.splice(newIndex, 0, moved);

  await saveItems(folderId, copy);
  await init();
}

function cancelHoldTimer() {
  if (dragState?.holdTimer) {
    clearTimeout(dragState.holdTimer);
    dragState.holdTimer = null;
  }
}

function attachDragHandle(handleBtn, listEl, rowEl, folderId, items, index) {
  let startClientY = 0;

  const beginDrag = () => {
    const ghost = makeGhost(rowEl);
    const placeholder = makePlaceholder(rowEl);
    rowEl.style.visibility = 'hidden';
    rowEl.after(placeholder);

    const r = rowEl.getBoundingClientRect();
    dragState.ghostEl = ghost;
    dragState.placeholderEl = placeholder;
    dragState.offsetY = (startClientY + window.scrollY) - (r.top + window.scrollY);

    const moveEv = ('ontouchstart' in window) ? 'touchmove' : 'mousemove';
    const upEv   = ('ontouchstart' in window) ? 'touchend'  : 'mouseup';

    const _onMove = (e) => onMove(e);
    const _onUp   = async (e) => {
      document.removeEventListener(moveEv, _onMove, { passive:false });
      document.removeEventListener(upEv, _onUp, { passive:false });
      await onUp(e);
    };

    document.addEventListener(moveEv, _onMove, { passive:false });
    document.addEventListener(upEv, _onUp, { passive:false });
  };

  const onPointerDown = (e) => {
    if (locked) return;
    closePopover();

    startClientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);

    dragState = {
      folderId, items, listEl, rowEl,
      ghostEl: null, placeholderEl: null,
      startIndex: index,
      startY: startClientY,
      offsetY: 0,
      holdTimer: setTimeout(() => { beginDrag(); }, DRAG_HOLD_MS)
    };

    const moveEv = ('ontouchstart' in window) ? 'touchmove' : 'mousemove';
    const upEv   = ('ontouchstart' in window) ? 'touchend'  : 'mouseup';

    const _cancelIfMoved = (ev) => {
      const y = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY);
      if (Math.abs(y - dragState.startY) > MOVE_CANCEL_PX && !dragState.ghostEl) {
        cancelHoldTimer();
        dragState = null;
        document.removeEventListener(moveEv, _cancelIfMoved, { passive:true });
        document.removeEventListener(upEv, _cancelPress, { passive:true });
      }
    };

    const _cancelPress = (ev) => {
      if (!dragState) return;
      if (!dragState.ghostEl) {
        cancelHoldTimer();
        dragState = null;
      }
      document.removeEventListener(moveEv, _cancelIfMoved, { passive:true });
      document.removeEventListener(upEv, _cancelPress, { passive:true });
    };

    document.addEventListener(moveEv, _cancelIfMoved, { passive:true });
    document.addEventListener(upEv, _cancelPress, { passive:true });

    e.preventDefault();
  };

  handleBtn.addEventListener('touchstart', onPointerDown, { passive:false });
  handleBtn.addEventListener('mousedown',  onPointerDown);
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
    if (!newName) { cleanup; return; }
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
          else if (kind === 'length') items.push({ kind: 'length', name: '' });        // lengthFt unset → shows "—"
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

      const main = document.createElement('div');
      main.className = 'row-main';

      if (!locked) {
        // Delete item (left side)
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.className = 'delete-btn';
        delBtn.title = 'Delete item';
        delBtn.addEventListener('click', async () => {
          items.splice(index, 1);
          await saveItems(folderId, items);
          await init();
        });
        main.appendChild(delBtn);
      }

      // Name: input (unlocked) or static (locked)
      if (locked) {
        const nameText = document.createElement('span');
        nameText.className = 'name-text';
        nameText.textContent = item.name && item.name.trim() ? item.name : '(no name)';
        main.appendChild(nameText);
      } else {
        const nameI = document.createElement('input');
        nameI.type = 'text';
        nameI.placeholder = 'Item name';
        nameI.value = item.name || '';
        nameI.addEventListener('change', async () => {
          items[index].name = nameI.value;
          await saveItems(folderId, items);
        });
        main.appendChild(nameI);
      }

      // Right-side controls by kind
      if (kind === 'qty') {
        if (locked) {
          const qtyText = document.createElement('span');
          qtyText.className = 'qty-text';
          qtyText.textContent = String(item.qty ?? 0);
          main.appendChild(qtyText);
        } else {
          const minus = document.createElement('button');
          minus.textContent = '−';
          minus.title = 'Decrement';
          minus.addEventListener('click', async (e) => {
            e.preventDefault();
            const v = Math.max(0, (item.qty || 0) - 1);
            items[index].qty = v;
            qty.value = v;
            await saveItems(folderId, items);
          });
          main.appendChild(minus);

          const qty = document.createElement('input');
          qty.type = 'number';
          qty.min = '0';
          qty.value = item.qty || 0;
          qty.addEventListener('change', async () => {
            items[index].qty = Math.max(0, parseInt(qty.value || '0', 10));
            qty.value = items[index].qty;
            await saveItems(folderId, items);
          });
          main.appendChild(qty);

          const plus = document.createElement('button');
          plus.textContent = '+';
          plus.title = 'Increment';
          plus.addEventListener('click', async (e) => {
            e.preventDefault();
            const v = (item.qty || 0) + 1;
            items[index].qty = v;
            qty.value = v;
            await saveItems(folderId, items);
          });
          main.appendChild(plus);
        }
      } else if (kind === 'status') {
        if (locked) {
          const chip = document.createElement('span');
          chip.className = `status-chip ${statusActive || 'none'}`;
          chip.textContent = statusActive ? (STATUS_LABEL[statusActive] || statusActive) : '—';
          main.appendChild(chip);
        } else {
          const picker = document.createElement('button');
          picker.className = `status-picker ${statusActive || 'none'}`;
          picker.textContent = statusActive ? STATUS_LABEL[statusActive] : 'Set status';
          picker.title = 'Set status';
          picker.addEventListener('click', (e) => {
            e.preventDefault();
            showStatusPopover(picker, statusActive, async (newVal) => {
              if (newVal) items[index].status = newVal; else delete items[index].status;
              await saveItems(folderId, items);
              await init();
            });
          });
          main.appendChild(picker);
        }
      } else { // kind === 'length'
        if (locked) {
          const lenText = document.createElement('span');
          lenText.className = 'len-text';
          if (typeof item.lengthFt === 'number') {
            lenText.textContent = `${item.lengthFt} ft`;
          } else {
            lenText.textContent = '—';
          }
          main.appendChild(lenText);
        } else {
          const lenGroup = document.createElement('div');
          lenGroup.className = 'len-group';

          const lenInput = document.createElement('input');
          lenInput.type = 'number';
          lenInput.step = '0.1';
          lenInput.value = (typeof item.lengthFt === 'number') ? String(item.lengthFt) : '';
          lenInput.className = 'len-input';
          lenInput.placeholder = '0.0';
          lenInput.addEventListener('change', async () => {
            const v = parseFloat(lenInput.value);
            if (Number.isFinite(v)) items[index].lengthFt = v;
            else delete items[index].lengthFt;
            await saveItems(folderId, items);
          });

          const unit = document.createElement('span');
          unit.className = 'unit';
          unit.textContent = 'ft';

          lenGroup.appendChild(lenInput);
          lenGroup.appendChild(unit);
          main.appendChild(lenGroup);
        }
      }

      // DRAG HANDLE ON FAR RIGHT (replaces old Type button spot)
      if (!locked) {
        const handle = document.createElement('button');
        handle.className = 'drag-handle';
        handle.title = 'Hold 0.25s to reorder';
        handle.setAttribute('aria-label', 'Reorder item (press and hold)');
        main.appendChild(handle);              // append LAST so it's on the far right
        attachDragHandle(handle, list, row, folderId, items, index);
      }

      row.appendChild(main);
      list.appendChild(row);
    };

    items.forEach(pushRow);
  });
}

// Controls
addFolderBtn?.addEventListener('click', async () => {
  if (locked) return;
  const name = prompt('Folder name?');
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;

  const all = await loadAll();
  const dup = Object.values(all).some(f => (f?.name || '').trim().toLowerCase() === clean.toLowerCase());
  if (dup) { alert('That folder name is already in use.'); return; }

  const id = slugify(clean);
  if (all[id]) { alert('A folder with a similar ID already exists. Try a different name.'); return; }

  await ensureFolder(id, { name: clean, items: [] });
  setCollapsed(id, false);
  await init();
});

downloadBtn?.addEventListener('click', async () => {
  const data = await loadAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${pageKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

toggleLockBtn?.addEventListener('click', () => {
  locked = !locked;
  setLockUI();
  init();
  closePopover();
});

window.addEventListener('beforeunload', () => {
  locked = true;
  setLockUI();
  closePopover();
});

// Boot
async function init() {
  try {
    const data = await loadAll();
    render(data);
  } catch (err) {
    console.error('Firestore load error:', err);
    container.innerHTML = '<p style="color:#900">Could not load data. Verify Firebase config and Firestore rules.</p>';
  }
}

setLockUI();
init();
