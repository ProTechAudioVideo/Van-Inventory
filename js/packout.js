// js/packout.js
// Van Inventory (Firestore, no auth, no expiry)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// -------------------------------
// Firebase config (your project)
// -------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.firebasestorage.app",
  messagingSenderId: "86651643634",
  appId: "1:86651643634:web:6891641e14e8214a34526b",
  measurementId: "G-Z7XRSJ486Q"
};

// Init
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Figure out which packout this page is for via the script tag’s data attribute
const scriptEl  = document.querySelector('script[data-packout]');
const packoutId = (scriptEl && scriptEl.dataset.packout) ? scriptEl.dataset.packout : "packout-1";

// DOM
const addFolderBtn = document.getElementById("add-folder");
const container    = document.getElementById("packout-container");

// Firestore doc path: packouts/{packoutId}
const docRef = doc(db, "packouts", packoutId);

// Keep track of which folders are open in the UI
const expandedFolders = new Set();

// Local cache of data: { [folderName]: Array<{name:string, quantity:number}> }
let packoutData = {};

// -------------------------------------
// Ensure doc exists, then live-listen
// -------------------------------------
(async function init() {
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, { data: {}, ts: Date.now() });
    }
  } catch (e) {
    console.error("Error ensuring doc exists:", e);
  }

  // Live updates
  onSnapshot(docRef, (snap) => {
    const docData = snap.data();
    packoutData = (docData && docData.data) ? docData.data : {};
    render(packoutData);
  });
})();

// -------------------------------------
// Persist full data back to Firestore
// -------------------------------------
async function save() {
  try {
    await setDoc(docRef, { data: packoutData, ts: Date.now() }, { merge: true });
  } catch (e) {
    console.error("Save failed:", e);
  }
}

// -------------------------------------
// Add Folder button
// -------------------------------------
addFolderBtn.addEventListener("click", () => {
  const name = prompt("New folder name:");
  if (!name) return;
  if (!packoutData[name]) {
    packoutData[name] = [];
  }
  expandedFolders.add(name);
  render(packoutData);
  save();
});

// -------------------------------------
// Render UI
// -------------------------------------
function render(data) {
  container.innerHTML = "";

  Object.entries(data).forEach(([folder, items]) => {
    // Folder header row
    const fld = document.createElement("div");
    fld.className = "folder";

    const isExpanded = expandedFolders.has(folder);

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = isExpanded ? "▼" : "▶";
    fld.appendChild(arrow);

    const title = document.createElement("span");
    title.className = "folder-title";
    title.textContent = folder;
    fld.appendChild(title);

    const addBtn = document.createElement("button");
    addBtn.className = "folder-add";
    addBtn.title = "Add item to " + folder;
    addBtn.textContent = "+";
    fld.appendChild(addBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "folder-remove";
    removeBtn.textContent = "🗑️";
    fld.appendChild(removeBtn);

    container.appendChild(fld);

    // Items list container
    const list = document.createElement("div");
    list.className = "folder-items";
    list.style.display = isExpanded ? "block" : "none";
    container.appendChild(list);

    // Open/close behavior
    arrow.addEventListener("click", () => {
      const showing = list.style.display === "block";
      if (showing) {
        list.style.display = "none";
        arrow.textContent = "▶";
        expandedFolders.delete(folder);
      } else {
        list.style.display = "block";
        arrow.textContent = "▼";
        expandedFolders.add(folder);
      }
    });

    // Add item to this folder
    addBtn.addEventListener("click", () => {
      items.push({ name: "", quantity: 0 });
      expandedFolders.add(folder);
      render(packoutData);
      save();
    });

    // Delete the whole folder
    removeBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!confirm(`Delete folder “${folder}” and all its items?`)) return;
      delete packoutData[folder];
      expandedFolders.delete(folder);
      render(packoutData);
      save();
    });

    // Render each item row
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "row";

      // Delete row
      const del = document.createElement("button");
      del.textContent = "🗑️";
      del.classList.add("delete-btn");
      del.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        items.splice(i, 1);
        render(packoutData);
        save();
      });
      row.appendChild(del);

      // Name
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Item name";
      nameInput.value = item.name || "";
      nameInput.addEventListener("change", () => {
        items[i].name = nameInput.value;
        save();
      });
      row.appendChild(nameInput);

      // Minus
      const minus = document.createElement("button");
      minus.textContent = "–";
      minus.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const qtyInput = row.querySelector('input[type="number"]');
        item.quantity = Math.max(0, (item.quantity || 0) - 1);
        qtyInput.value = item.quantity;
        save();
      });
      row.appendChild(minus);

      // Quantity
      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = 0;
      qty.value = item.quantity || 0;
      qty.addEventListener("change", () => {
        items[i].quantity = parseInt(qty.value, 10) || 0;
        save();
      });
      row.appendChild(qty);

      // Plus
      const plus = document.createElement("button");
      plus.textContent = "+";
      plus.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        item.quantity = (item.quantity || 0) + 1;
        qty.value = item.quantity;
        save();
      });
      row.appendChild(plus);

      list.appendChild(row);
    });
  });
}
