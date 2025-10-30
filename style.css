/* /style.css */

/* ===== Base / reset ===== */
* { box-sizing: border-box; }
html, body { max-width: 100%; overflow-x: hidden; }
html { -webkit-text-size-adjust: 100%; }
body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; margin:16px; }
h1 { margin:0 0 8px; }
a { color:#064e3b; }
button { cursor:pointer; }
#add-folder, #download-json { padding:6px 10px; margin-right:6px; }

/* ===== Folder header (caret) ===== */
.folder {
  display:flex; align-items:center; gap:8px; margin-top:14px; font-weight:600;
}
.folder-title { flex:1; user-select:none; }
.caret {
  width:26px; height:26px; border:1px solid #cbd5e1; border-radius:4px; background:#fff;
  display:inline-flex; align-items:center; justify-content:center; line-height:1; font-size:16px;
}
.caret:focus { outline:2px solid #0ea5e9; outline-offset:2px; }
.delete-btn {
  background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; border-radius:4px;
  padding:4px 6px; font-size:.9rem;
}

/* ===== Items list ===== */
.folder-items { margin:8px 0 16px 34px; }   /* default (desktop) */
.folder.collapsed + .folder-items { display:none; }

/* ===== Item rows ===== */
.row { display:flex; flex-direction:column; gap:6px; margin:8px 0; }

/* --- main line: trash | name | - | qty | + --- */
.row-main { display:flex; align-items:center; gap:8px; flex-wrap:nowrap; }
.row-main > * { flex: 0 0 auto; }

.row input[type="text"]{
  min-width:0;           /* allow shrink on small screens (prevents overflow) */
  flex:1 1 auto;
  padding:6px 8px;
}

input[type="number"]{
  width:2.8em;           /* desktop; tightened on iPhone below */
  text-align:center;
  -moz-appearance:textfield;
  appearance:textfield;
  padding:6px 6px;
}
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button{ -webkit-appearance:none; margin:0; }

.row button { padding:4px 8px; }

/* ===== Status row (under main line) ===== */
.status-bar { display:flex; gap:6px; flex-wrap:wrap; padding-left:0; }
.status-btn {
  border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; border-radius:4px;
  padding:4px 10px; font-size:.8rem;
}
.status-btn[aria-pressed="true"] { font-weight:700; }
.status-btn.full[aria-pressed="true"]  { background:#dcfce7; border-color:#22c55e; color:#14532d; }
.status-btn.mid[aria-pressed="true"]   { background:#fef9c3; border-color:#eab308; color:#713f12; }
.status-btn.low[aria-pressed="true"]   { background:#ffedd5; border-color:#f97316; color:#7c2d12; }
.status-btn.empty[aria-pressed="true"] { background:#fee2e2; border-color:#ef4444; color:#991b1b; }

/* ===== iPhone portrait fine-tuning (matches your "before" look) ===== */
@media (max-width: 430px) {
  body { margin:12px; }

  /* Slightly tighter caret + indent so rows fit without horizontal scroll */
  .caret { width:22px; height:22px; }
  .folder-items { margin-left:18px; }   /* was 34px; closer to your original */

  /* Keep everything on one line without wrapping */
  .row-main { gap:6px; }

  /* Make qty box slimmer (iOS likes to make it wide) */
  input[type="number"] { width:2.35em; padding:6px 4px; }

  /* Keep status buttons tidy but readable */
  .status-btn { padding:3px 8px; font-size:.75rem; }
}

/* Extra guard against phantom overflow from rounded borders/shadows */
.container, .folder, .row, .row-main, .status-bar { max-width: 100%; }
