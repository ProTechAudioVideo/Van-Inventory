// js/packout.js
// Van Inventory (Firestore, no auth) — folders, items, qty +/- , delete, download JSON

// ─── Firebase (v10) ──────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Replace with YOUR config (protech-van-inventory-2025)
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.firebasestorage.app",
  messagingSenderId: "86651643634",
  appId: "1:86651643634:web:6891641e14e8214a34526b",
  measurementId: "G-Z7XRSJ486Q"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── Page wiring ─────────────────────────────────────────────────────────────
const addFolderBtn   = document.getElementById('add-folder');
const containerEl    = document.getElementById('packout-container');
const downloadBtn    = document.getElementById('download-json'); // optional

// Derive the packout key from the page title ("Packout 1" -> "packout-1")
function getPackoutKey() {
  const t = (document.title || 'packout').trim().toLowerCase();
  return t.replace(/\s+/g, '-'); // e.g. "Packout 1" => "packout-1"
}
const PACKOUT_KEY = getPackoutKey();

// Firestore location: packouts/{packout-key}
const docRef = doc(db, 'packouts', PACKOUT_KEY);

// In-memory state
let folders = {}; // { "Folder Name": [ {name:"", quantity:0}, ... ] }

// ─── Persistence helpers ────────────────────────────────────────────────────
async function load() {
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    folders = data?.folders || {};
  } else {
    folders = {};
    await setDoc(docRef, { folders, ts: Date.now() }); // create doc
  }
}

// Overwrite the whole doc (no merge) so removed items don’t linger
async function save() {
  await setDoc(docRef, { folders, ts: Date.now() }); // merge: false by default
}

// Delete a single folder key from the nested map in Firestore,
// then mirror it locally.
async function removeFolder(folderName) {
  await updateDoc(docRef, {
    [`folders.${folderName}`]: deleteField(),
    ts: Date.now()
  });
  delete folders[folderName];
}

// ─── UI builders ────────────────────────────────────────────────────────────
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== undefined && v !== null) {
      el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

function render() {
  containerEl.innerHTML = '';

  // For each folder
  Object.entries(folders).forEach(([folderName, items]) => {
    const header = h('div', { className: 'folder' },
      h('span', { className: 'arrow' }, '▼'),
      h('span', { className: 'folder-title' }, folderName),
      // + item
      h('button', {
        className: 'folder-add',
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          items.push({ name: '', quantity: 0 });
          render();
          save().catch(console.error);
        }
      }, '+'),
      // 🗑️ delete folder (CLICK + stopPropagation)
      h('button', {
        className: 'folder-remove',
        title: 'Delete folder',
        onClick: async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ok = confirm(`Delete folder “${folderName}” and all its items?`);
          if (!ok) return;
          try {
            await removeFolder(folderName);
            render();
          } catch (err) {
            console.error(err);
            alert('Could not delete. Check Firestore Rules.');
          }
        }
      }, '🗑️'),
    );

    containerEl.appendChild(header);

    // Items list
    const list = h('div', { className: 'folder-items' });
    containerEl.appendChild(list);

    items.forEach((item, idx) => {
      let qtyInput; // captured by +/- handlers

      const row = h('div', { className: 'row' },
        // delete item
        h('button', {
          className: 'delete-btn',
          title: 'Delete item',
          onClick: (e) => {
            e.preventDefault();
            items.splice(idx, 1);
            render();
            save().catch(console.error);
          }
        }, '🗑️'),

        // name
        h('input', {
          type: 'text',
          value: item.name || '',
          placeholder: 'Item name',
          onChange: (e) => {
            items[idx].name = e.target.value;
            save().catch(console.error);
          }
        }),

        // minus
        h('button', {
          onClick: (e) => {
            e.preventDefault();
            const q = Math.max(0, (item.quantity || 0) - 1);
            items[idx].quantity = q;
            if (qtyInput) qtyInput.value = String(q);
            save().catch(console.error);
          }
        }, '–'),

        // qty
        (() => {
          const el = h('input', {
            type: 'number',
            min: '0',
            value: String(item.quantity || 0),
            onChange: (e) => {
              const n = parseInt(e.target.value, 10);
              items[idx].quantity = Number.isFinite(n) && n >= 0 ? n : 0;
              save().catch(console.error);
            }
          });
          qtyInput = el;
          return el;
        })(),

        // plus
        h('button', {
          onClick: (e) => {
            e.preventDefault();
            const q = (item.quantity || 0) + 1;
            items[idx].quantity = q;
            if (qtyInput) qtyInput.value = String(q);
            save().catch(console.error);
          }
        }, '+'),
      );

      list.appendChild(row);
    });
  });
}

// ─── Handlers ───────────────────────────────────────────────────────────────
if (addFolderBtn) {
  addFolderBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const name = prompt('New folder name:');
    if (!name) return;
    if (!folders[name]) folders[name] = [];
    render();
    try { await save(); } catch (err) { console.error(err); alert('Could not save. Check Firestore Rules.'); }
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const payload = { packout: PACKOUT_KEY, folders };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${PACKOUT_KEY}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────
(async function init() {
  try {
    await load();
    render();
    console.log(`Packout "${PACKOUT_KEY}" — Firestore OK:`, { ok: true, ts: Date.now() });
  } catch (err) {
    console.error('Init failed:', err);
    alert('Could not load from Firestore. Check your Firebase config and rules.');
  }
})();
