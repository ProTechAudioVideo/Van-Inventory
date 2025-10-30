// Firestore (no auth), shared for all Packout pages.
// One doc per pageKey under collection "pages".
// Data shape: { ts: number, folders: { [folderName]: [{ name: string, quantity: number }] } }

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Your Firestore config ---
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

// --- Page key comes from <body data-packout="packout-1"> etc ---
const pageKey = (document.body.dataset.packout || 'packout-1').trim();
const pageRef = doc(db, 'pages', pageKey);

// --- Local working copy of folders map ---
let folders = {};  // { [folderName]: Array<{name, quantity}> }

// Ensure doc exists once
(async () => {
  const snap = await getDoc(pageRef);
  if (!snap.exists()) {
    await setDoc(pageRef, { ts: Date.now(), folders: {} }, { merge: true });
  }
})().catch(console.error);

// Live updates
onSnapshot(pageRef, (snap) => {
  const data = snap.data() || {};
  folders = data.folders || {};
  render();
}, console.error);

// Save helper
async function save() {
  await setDoc(pageRef, { ts: Date.now(), folders }, { merge: true });
}

// UI rendering
function render() {
  const container = document.getElementById('page-container');
  container.innerHTML = '';

  // Controls
  const addBtn = document.getElementById('add-folder');
  const dlBtn  = document.getElementById('download-json');

  // Add folder
  addBtn.onclick = async () => {
    const name = prompt('New folder name:');
    if (!name) return;
    if (!folders[name]) folders[name] = [];
    await save();
    render(); // reflect instantly
  };

  // Download JSON
  dlBtn.onclick = () => {
    const json = JSON.stringify(folders, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${pageKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render folders
  Object.entries(folders).forEach(([folderName, items]) => {
    // Folder header
    const fld = document.createElement('div');
    fld.className = 'folder';

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '▼';
    fld.appendChild(arrow);

    const title = document.createElement('span');
    title.className = 'folder-title';
    title.textContent = folderName;
    fld.appendChild(title);

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = '+';
    addItemBtn.title = `Add item to ${folderName}`;
    addItemBtn.className = 'folder-add';
    fld.appendChild(addItemBtn);

    // Delete folder
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '🗑️';
    removeBtn.className = 'folder-remove';
    fld.appendChild(removeBtn);

    container.appendChild(fld);

    // Items list
    const list = document.createElement('div');
    list.className = 'folder-items';
    list.style.display = 'block';
    container.appendChild(list);

    // Toggle open/close
    arrow.onclick = () => {
      const open = list.style.display === 'block';
      list.style.display = open ? 'none' : 'block';
      arrow.textContent  = open ? '▶' : '▼';
    };

    // Add item
    addItemBtn.onclick = async () => {
      items.push({ name: '', quantity: 0 });
      await save();
      render();
    };

    // Render rows
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'row';

      // Delete item
      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.classList.add('delete-btn');
      del.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        items.splice(idx, 1);
        await save();
        render();
      });
      row.appendChild(del);

      // Name
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = item.name || '';
      nameInput.placeholder = 'Item name';
      nameInput.onchange = async () => {
        items[idx].name = nameInput.value;
        await save();
      };
      row.appendChild(nameInput);

      // Minus
      const minus = document.createElement('button');
      minus.textContent = '–';
      minus.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        items[idx].quantity = Math.max(0, (items[idx].quantity || 0) - 1);
        qty.value = items[idx].quantity;
        await save();
      });
      row.appendChild(minus);

      // Quantity
      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = 0;
      qty.value = item.quantity || 0;
      qty.onchange = async () => {
        items[idx].quantity = parseInt(qty.value, 10) || 0;
        await save();
      };
      row.appendChild(qty);

      // Plus
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        items[idx].quantity = (items[idx].quantity || 0) + 1;
        qty.value = items[idx].quantity;
        await save();
      });
      row.appendChild(plus);

      list.appendChild(row);
    });
  });
}
