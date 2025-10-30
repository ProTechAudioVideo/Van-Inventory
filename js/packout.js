<script type="module">
// Vanilla Packout UI backed by Firestore (no auth, no expiry)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ── Your Firebase config ──
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

// Which packout are we on? (from <body data-packout-id="packout1">)
const packoutId = document.body.dataset.packoutId || "packout1";

// DOM
const addFolderBtn = document.getElementById("add-folder");
const downloadBtn  = document.getElementById("download-json");
const container    = document.getElementById("packout-container");

// State
let folders = {}; // { folderName: [ {name:'', quantity:0}, ... ] }
const expandedFolders = new Set();

const docRef = doc(db, "packouts", packoutId);

// Ensure doc exists
(async () => {
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await setDoc(docRef, { folders: {} }, { merge: true });
  }
})();

// Live updates
onSnapshot(docRef, (snap) => {
  const data = snap.data() || {};
  folders = data.folders || {};
  render();
}, (err) => console.error(err));

addFolderBtn.onclick = async () => {
  const name = prompt("New folder name:");
  if (!name) return;
  if (!folders[name]) folders[name] = [];
  expandedFolders.add(name);
  await persist();
};

downloadBtn.onclick = () => {
  const blob = new Blob([JSON.stringify({ packoutId, folders }, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${packoutId}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

function render() {
  container.innerHTML = "";

  Object.entries(folders).forEach(([folderName, items]) => {
    // Folder header
    const header = document.createElement("div");
    header.className = "folder";

    const isOpen = expandedFolders.has(folderName);

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = isOpen ? "▼" : "▶";
    header.appendChild(arrow);

    const title = document.createElement("span");
    title.className = "folder-title";
    title.textContent = folderName;
    header.appendChild(title);

    const addBtn = document.createElement("button");
    addBtn.className = "folder-add";
    addBtn.title = `Add item to ${folderName}`;
    addBtn.textContent = "+";
    header.appendChild(addBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "folder-remove";
    delBtn.textContent = "🗑️";
    header.appendChild(delBtn);

    container.appendChild(header);

    // Items container
    const list = document.createElement("div");
    list.className = "folder-items";
    list.style.display = isOpen ? "block" : "none";
    container.appendChild(list);

    // Toggle open/close
    arrow.onclick = () => {
      if (list.style.display === "block") {
        list.style.display = "none";
        arrow.textContent = "▶";
        expandedFolders.delete(folderName);
      } else {
        list.style.display = "block";
        arrow.textContent = "▼";
        expandedFolders.add(folderName);
      }
    };

    // Add item
    addBtn.onclick = async () => {
      items.push({ name: "", quantity: 0 });
      expandedFolders.add(folderName);
      await persist();
    };

    // Delete folder
    delBtn.addEventListener("pointerdown", async (e) => {
      e.preventDefault();
      if (!confirm(`Delete folder “${folderName}” and all its items?`)) return;
      delete folders[folderName];
      expandedFolders.delete(folderName);
      await persist();
    });

    // Render items
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "row";

      // Delete item
      const delItem = document.createElement("button");
      delItem.textContent = "🗑️";
      delItem.className = "delete-btn";
      delItem.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        items.splice(i, 1);
        await persist();
      });
      row.appendChild(delItem);

      // Name
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Item name";
      nameInput.value = item.name || "";
      nameInput.onchange = async () => {
        items[i].name = nameInput.value;
        await persist();
      };
      row.appendChild(nameInput);

      // Minus
      const minus = document.createElement("button");
      minus.textContent = "–";
      minus.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        const q = Number(items[i].quantity || 0);
        items[i].quantity = Math.max(0, q - 1);
        qty.value = items[i].quantity;
        await persist();
      });
      row.appendChild(minus);

      // Quantity
      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = 0;
      qty.value = Number(item.quantity || 0);
      qty.onchange = async () => {
        items[i].quantity = parseInt(qty.value, 10) || 0;
        await persist();
      };
      row.appendChild(qty);

      // Plus
      const plus = document.createElement("button");
      plus.textContent = "+";
      plus.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        items[i].quantity = Number(items[i].quantity || 0) + 1;
        qty.value = items[i].quantity;
        await persist();
      });
      row.appendChild(plus);

      list.appendChild(row);
    });
  });
}

async function persist() {
  // Save whole folders map back into Firestore
  await setDoc(docRef, { folders }, { merge: true });
  // UI will update via onSnapshot
}
</script>
