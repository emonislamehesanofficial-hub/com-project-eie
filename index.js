// ============================================================
// Medito Glass Backend v2 — edge-to-edge web + online streaming
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// -------- Range-enabled static serving (for streaming / seek) --------
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(UPLOAD_DIR, decodeURIComponent(req.path));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg'
            : ext === '.wav' ? 'audio/wav'
            : ext === '.m4a' ? 'audio/mp4'
            : ext === '.ogg' ? 'audio/ogg'
            : ext === '.png' ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
            : 'application/octet-stream';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ------------------------------------------------------------
// In-memory data (persist to JSON on disk so it survives restart)
// ------------------------------------------------------------
const DB_FILE = path.join(__dirname, 'data.json');

let db = { meditation: [], nature: [], guided: [] };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
}
function saveDb() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (_) {}
}

// Seed some online streaming tracks (no local file needed)
if (db.meditation.length === 0) {
  db.meditation = [
    { id: 'med_rain', title: 'Gentle Rain', description: 'Soft rainfall for deep focus',
      thumbnail: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3',
      source: 'online', likes: 0 },
    { id: 'med_ocean', title: 'Ocean Waves', description: 'Calm sea waves',
      thumbnail: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_2b9f6efc5f.mp3',
      source: 'online', likes: 0 }
  ];
}
if (db.nature.length === 0) {
  db.nature = [
    { id: 'nat_thunder', title: 'Distant Thunder', description: 'Rolling thunder far away',
      thumbnail: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
      source: 'online', likes: 0 },
    { id: 'nat_river', title: 'Mountain River', description: 'Water over rocks',
      thumbnail: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_8a8f4c1a4e.mp3',
      source: 'online', likes: 0 }
  ];
}
if (db.guided.length === 0) {
  db.guided = [
    { id: 'guide_5', title: '5 Min Breathing', description: 'Quick reset',
      thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
      duration: '5:00', instructor: 'Sarah', source: 'online', likes: 0 },
    { id: 'guide_10', title: 'Body Scan', description: 'Release tension',
      thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3',
      duration: '10:00', instructor: 'Michael', source: 'online', likes: 0 }
  ];
}
saveDb();

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
app.get('/api/sounds', (req, res) => res.json({ sounds: db.meditation }));
app.get('/api/nature', (req, res) => res.json({ sounds: db.nature }));
app.get('/api/guided', (req, res) => res.json({ meditations: db.guided }));

// Search across all categories
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const all = [
    ...db.meditation.map(s => ({ ...s, category: 'meditation' })),
    ...db.nature.map(s => ({ ...s, category: 'nature' })),
    ...db.guided.map(s => ({ ...s, category: 'guided' }))
  ].filter(s => s.title.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
  res.json({ results: all });
});

// ------------------------------------------------------------
// Upload from storage
// ------------------------------------------------------------
app.post('/api/admin/upload',
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  (req, res) => {
    try {
      const type = (req.body.type || 'meditation').toLowerCase();
      const title = req.body.title || 'Untitled';
      const description = req.body.description || '';
      const duration = req.body.duration || '';
      const instructor = req.body.instructor || '';
      const audioFile = req.files?.audio?.[0];
      const thumbFile = req.files?.thumbnail?.[0];
      if (!audioFile) return res.status(400).json({ error: 'Audio required' });

      const id = `${type.slice(0,3)}_${Date.now()}`;
      const host = `${req.protocol}://${req.get('host')}`;
      const audioUrl = `${host}/uploads/${audioFile.filename}`;
      const thumbnail = thumbFile ? `${host}/uploads/${thumbFile.filename}`
        : 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800';

      const item = { id, title, description, thumbnail, audioUrl, source: 'local', likes: 0 };
      if (type === 'nature') db.nature.push(item);
      else if (type === 'guided') db.guided.push({ ...item, duration, instructor });
      else db.meditation.push(item);
      saveDb();
      res.json({ ok: true, item });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

// Add by online URL (stream)
app.post('/api/admin/sounds', (req, res) => {
  const { type, title, description, thumbnail, audioUrl, duration, instructor } = req.body;
  const id = `${(type || 'med').slice(0,3)}_${Date.now()}`;
  const item = { id, title, description, thumbnail, audioUrl, source: 'online', likes: 0 };
  if (type === 'nature') db.nature.push(item);
  else if (type === 'guided') db.guided.push({ ...item, duration, instructor });
  else db.meditation.push(item);
  saveDb();
  res.json({ ok: true, item });
});

// Like
app.post('/api/like/:id', (req, res) => {
  const id = req.params.id;
  const all = [...db.meditation, ...db.nature, ...db.guided];
  const item = all.find(s => s.id === id);
  if (item) item.likes = (item.likes || 0) + 1;
  saveDb();
  res.json({ ok: true, likes: item?.likes || 0 });
});

// Delete
app.delete('/api/admin/sounds/:id', (req, res) => {
  const id = req.params.id;
  for (const key of ['meditation', 'nature', 'guided']) {
    const idx = db[key].findIndex(s => s.id === id);
    if (idx !== -1) {
      const [item] = db[key].splice(idx, 1);
      try {
        if (item.audioUrl?.includes('/uploads/')) {
          const f = path.join(UPLOAD_DIR, item.audioUrl.split('/uploads/').pop());
          if (fs.existsSync(f)) fs.unlinkSync(f);
        }
        if (item.thumbnail?.includes('/uploads/')) {
          const f = path.join(UPLOAD_DIR, item.thumbnail.split('/uploads/').pop());
          if (fs.existsSync(f)) fs.unlinkSync(f);
        }
      } catch (_) {}
      saveDb();
      return res.json({ ok: true });
    }
  }
  res.json({ ok: false });
});

// ------------------------------------------------------------
// ADMIN — Edge-to-edge glass UI with tabs + online + upload
// ------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#07090D">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Medito Studio — Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html {
    height:100%;
    background:#07090D;
    /* iOS safe area */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  body {
    min-height:100vh;
    min-height:100dvh;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
    color:#E6EDF3;
    background:#07090D;
    overflow-x:hidden;
    position:relative;
    padding:20px;
    padding-top:calc(20px + env(safe-area-inset-top));
    padding-bottom:calc(80px + env(safe-area-inset-bottom));
    overscroll-behavior:none;
    -webkit-user-select:none;
    user-select:none;
  }
  /* Fixed animated blobs */
  .blob { position:fixed; border-radius:50%; filter:blur(60px); pointer-events:none; z-index:0; opacity:.7;
    animation:drift 22s ease-in-out infinite alternate; will-change:transform; }
  .blob.b1 { width:520px; height:520px; top:-180px; right:-160px;
    background:radial-gradient(circle,#3B82C4 0%,rgba(59,130,196,0) 70%); }
  .blob.b2 { width:480px; height:480px; bottom:-160px; left:-140px;
    background:radial-gradient(circle,#3BB8B0 0%,rgba(59,184,176,0) 70%); animation-delay:-7s; }
  .blob.b3 { width:400px; height:400px; top:40%; left:35%;
    background:radial-gradient(circle,#8A5BC4 0%,rgba(138,91,196,0) 70%); animation-delay:-14s; }
  @keyframes drift {
    0%   { transform:translate3d(0,0,0) scale(1); }
    50%  { transform:translate3d(60px,-40px,0) scale(1.15); }
    100% { transform:translate3d(-40px,60px,0) scale(.95); }
  }

  .wrap { position:relative; z-index:1; max-width:1080px; margin:0 auto; }

  /* Sticky header (glass, edge-to-edge under status bar) */
  .header {
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px; margin:-20px -20px 20px -20px;
    background:rgba(7,9,13,0.55);
    border-bottom:1px solid rgba(255,255,255,0.1);
    backdrop-filter:blur(24px) saturate(180%);
    -webkit-backdrop-filter:blur(24px) saturate(180%);
    padding-top:calc(16px + env(safe-area-inset-top));
  }
  .header h1 { font-size:18px; font-weight:700; letter-spacing:.3px; }
  .badge { font-size:10px; padding:4px 10px; border-radius:100px;
    background:rgba(59,130,196,.22); border:1px solid rgba(59,130,196,.5);
    color:#A6C8E4; letter-spacing:.6px; text-transform:uppercase; font-weight:600; }

  /* Tabs — edge-to-edge scroll on small phones */
  .tabs { display:flex; gap:4px; padding:5px; margin-bottom:16px;
    background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14);
    border-radius:100px; backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.18);
    overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none;
    -webkit-overflow-scrolling:touch; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab { flex:0 0 auto; padding:10px 20px; border-radius:100px; font-size:13px;
    font-weight:600; color:#A6ADC8; cursor:pointer;
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    border:none; background:transparent; letter-spacing:.2px; white-space:nowrap; }
  .tab:hover { color:#E6EDF3; }
  .tab.active { color:#FFF;
    background:linear-gradient(135deg,rgba(59,130,196,.5),rgba(59,184,176,.35));
    box-shadow:0 6px 20px rgba(59,130,196,.35), inset 0 1px 0 rgba(255,255,255,.28); }

  /* Search bar */
  .search-wrap { margin-bottom:16px; position:relative; }
  .search-wrap input {
    width:100%; padding:14px 44px 14px 18px; font-size:14px; color:#E6EDF3;
    background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14);
    border-radius:16px; outline:none; font-family:inherit;
    backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    transition:all .25s; }
  .search-wrap input:focus { border-color:rgba(59,130,196,.7); background:rgba(255,255,255,.09); }
  .search-wrap .icon { position:absolute; right:16px; top:50%; transform:translateY(-50%);
    font-size:16px; opacity:.5; pointer-events:none; }

  /* Cards */
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
  @media (max-width:640px) { .grid { grid-template-columns:1fr; } }
  .card { padding:16px; border-radius:22px;
    background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.13);
    backdrop-filter:blur(22px) saturate(180%);
    -webkit-backdrop-filter:blur(22px) saturate(180%);
    box-shadow:0 18px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
    transition:transform .28s ease, box-shadow .28s ease; }
  .card:hover { transform:translateY(-4px);
    box-shadow:0 24px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.28); }
  .card img { width:100%; height:150px; object-fit:cover; border-radius:14px; margin-bottom:12px;
    box-shadow:0 6px 18px rgba(0,0,0,.4); background:rgba(255,255,255,.05); }
  .card h3 { font-size:15px; font-weight:700; margin-bottom:4px; }
  .card p { font-size:12px; color:#A6ADC8; line-height:1.5; margin-bottom:10px; }

  /* Inline audio player (online streaming) */
  .player { display:flex; align-items:center; gap:10px; padding:10px 12px;
    background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.1);
    border-radius:14px; margin-top:8px; }
  .player .pp { width:38px; height:38px; flex:0 0 38px; border-radius:50%; border:none;
    cursor:pointer; color:#FFF; font-size:14px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 4px 12px rgba(59,130,196,.4);
    display:flex; align-items:center; justify-content:center; }
  .player .pp:active { transform:scale(0.94); }
  .player .bar { flex:1; height:4px; border-radius:2px; background:rgba(255,255,255,.12);
    position:relative; cursor:pointer; }
  .player .bar .fill { height:100%; width:0%; border-radius:2px;
    background:linear-gradient(90deg,#3B82C4,#3BB8B0); transition:width .1s linear; }
  .player .time { font-size:11px; color:#A6ADC8; font-variant-numeric:tabular-nums; }
  .player .src { font-size:10px; padding:2px 8px; border-radius:100px;
    background:rgba(59,130,196,.2); color:#A6C8E4; letter-spacing:.4px; text-transform:uppercase; }

  .row { display:flex; gap:8px; align-items:center; margin-top:10px; }
  .pill { font-size:10px; padding:4px 10px; border-radius:100px;
    background:rgba(59,130,196,.2); border:1px solid rgba(59,130,196,.4);
    color:#A6C8E4; letter-spacing:.5px; text-transform:uppercase; font-weight:600; }
  .pill.online { background:rgba(139,91,196,.2); border-color:rgba(139,91,196,.45); color:#C8A6E4; }
  .like { padding:7px 12px; font-size:11px; border-radius:100px;
    background:rgba(59,184,176,.15); border:1px solid rgba(59,184,176,.4);
    color:#8FDBC8; cursor:pointer; font-weight:600; }
  .like:active { transform:scale(0.95); }
  .del { margin-left:auto; padding:7px 12px; font-size:11px; border-radius:100px;
    border:1px solid rgba(239,68,68,.5); background:rgba(239,68,68,.15);
    color:#FF8A8A; cursor:pointer; font-weight:600; }

  /* Add panel */
  .add-panel { margin-top:24px; padding:20px; border-radius:24px;
    background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.13);
    backdrop-filter:blur(22px) saturate(180%);
    -webkit-backdrop-filter:blur(22px) saturate(180%);
    box-shadow:0 18px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2); }
  .add-panel h2 { font-size:15px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
  .add-panel h2 .num { width:22px; height:22px; border-radius:50%; font-size:11px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0); color:#FFF;
    display:flex; align-items:center; justify-content:center; font-weight:700; }

  .mode-switch { display:flex; gap:4px; padding:5px; margin-bottom:14px;
    background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.1);
    border-radius:14px; }
  .mode-switch button { flex:1; padding:10px; font-size:12px; font-weight:600;
    border-radius:10px; border:none; background:transparent; color:#A6ADC8;
    cursor:pointer; transition:all .25s; }
  .mode-switch button.active { color:#FFF;
    background:linear-gradient(135deg,rgba(59,130,196,.5),rgba(59,184,176,.35));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.28); }

  .field { margin-bottom:10px; }
  .field label { display:block; font-size:11px; color:#A6ADC8; margin-bottom:5px;
    letter-spacing:.4px; text-transform:uppercase; font-weight:600; }
  .add-panel input[type=text], .add-panel textarea, .add-panel select {
    width:100%; padding:12px 16px; font-size:13px; color:#E6EDF3;
    background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.15);
    border-radius:14px; outline:none; font-family:inherit; resize:vertical;
    transition:all .2s; }
  .add-panel input:focus, .add-panel textarea:focus {
    border-color:rgba(59,130,196,.7); background:rgba(255,255,255,.08); }
  .add-panel button.primary { width:100%; padding:14px; font-size:14px; font-weight:700;
    border-radius:14px; border:none; cursor:pointer; color:#FFF; letter-spacing:.4px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 12px 30px rgba(59,130,196,.35), inset 0 1px 0 rgba(255,255,255,.28);
    transition:transform .2s; margin-top:6px; }
  .add-panel button.primary:active { transform:scale(.98); }
  .add-panel button.primary:disabled { opacity:.6; cursor:not-allowed; transform:none; }

  .drop-zone { padding:22px; border-radius:16px; text-align:center; cursor:pointer;
    border:2px dashed rgba(255,255,255,.2); background:rgba(255,255,255,.03);
    transition:all .25s; margin-bottom:10px; }
  .drop-zone:hover, .drop-zone.drag { border-color:rgba(59,130,196,.7);
    background:rgba(59,130,196,.1); }
  .drop-zone .icon { font-size:26px; margin-bottom:6px; opacity:.7; }
  .drop-zone .label { font-size:12px; color:#A6ADC8; }
  .drop-zone .filename { font-size:11px; color:#3BB8B0; margin-top:6px; font-weight:600;
    word-break:break-all; }

  .progress { height:6px; border-radius:3px; background:rgba(255,255,255,.1);
    margin-top:10px; overflow:hidden; display:none; }
  .progress.show { display:block; }
  .progress-bar { height:100%; width:0;
    background:linear-gradient(90deg,#3B82C4,#3BB8B0); transition:width .2s; }

  .empty { text-align:center; color:#A6ADC8; padding:40px 20px; font-size:13px; }
  .empty .icon { font-size:44px; opacity:.35; margin-bottom:10px; }

  .toast { position:fixed; bottom:calc(24px + env(safe-area-inset-bottom));
    left:50%; transform:translateX(-50%) translateY(120px); opacity:0;
    padding:12px 22px; border-radius:100px; font-size:13px;
    background:rgba(0,0,0,.85); color:#fff; border:1px solid rgba(255,255,255,.15);
    backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    transition:all .4s cubic-bezier(.22,.9,.28,1); z-index:100;
    max-width:calc(100vw - 40px); text-align:center; }
  .toast.show { transform:translateX(-50%) translateY(0); opacity:1; }
</style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>

  <div class="wrap">
    <div class="header">
      <h1>Medito Studio</h1>
      <div class="badge">Admin · Glass</div>
    </div>

    <div class="search-wrap">
      <input id="search" type="text" placeholder="Search all sounds…">
      <div class="icon">⌕</div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="meditation">Meditation</button>
      <button class="tab" data-tab="nature">Nature</button>
      <button class="tab" data-tab="guided">Guided</button>
    </div>

    <div class="grid" id="grid"></div>

    <div class="add-panel">
      <h2><span class="num">1</span> Add a new track</h2>

      <div class="mode-switch">
        <button class="mode active" data-mode="upload">Upload file</button>
        <button class="mode" data-mode="online">Online URL</button>
      </div>

      <div class="field">
        <label>Category</label>
        <select id="type">
          <option value="meditation">Meditation</option>
          <option value="nature">Nature</option>
          <option value="guided">Guided</option>
        </select>
      </div>
      <div class="field"><label>Title</label><input id="title" type="text" placeholder="e.g. Ocean Waves"></div>
      <div class="field"><label>Description</label><textarea id="description" rows="2" placeholder="Short description"></textarea></div>

      <!-- Upload mode -->
      <div id="uploadFields">
        <div class="drop-zone" id="dropAudio">
          <div class="icon">♪</div>
          <div class="label">Tap to pick audio from storage (mp3, wav, m4a)</div>
          <div class="filename" id="audioName"></div>
        </div>
        <input type="file" id="audioInput" accept="audio/*" hidden>

        <div class="drop-zone" id="dropThumb">
          <div class="icon">▣</div>
          <div class="label">Tap to pick thumbnail (optional)</div>
          <div class="filename" id="thumbName"></div>
        </div>
        <input type="file" id="thumbInput" accept="image/*" hidden>
      </div>

      <!-- Online mode -->
      <div id="onlineFields" style="display:none;">
        <div class="field"><label>Audio URL (mp3)</label>
          <input id="onlineAudio" type="text" placeholder="https://.../track.mp3"></div>
        <div class="field"><label>Thumbnail URL (optional)</label>
          <input id="onlineThumb" type="text" placeholder="https://.../cover.jpg"></div>
      </div>

      <div class="field"><label>Duration (guided only)</label>
        <input id="duration" type="text" placeholder="e.g. 10:00"></div>
      <div class="field"><label>Instructor (guided only)</label>
        <input id="instructor" type="text" placeholder="e.g. Sarah"></div>

      <button class="primary" id="submitBtn" onclick="submitTrack()">Add Track</button>
      <div class="progress" id="progress"><div class="progress-bar" id="progressBar"></div></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

<script>
  let currentTab = 'meditation';
  let currentMode = 'upload';
  const grid = document.getElementById('grid');
  const toast = document.getElementById('toast');
  let activeAudio = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function fmt(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentTab = t.dataset.tab;
      document.getElementById('search').value = '';
      load();
    });
  });

  document.querySelectorAll('.mode').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.mode').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentMode = b.dataset.mode;
      document.getElementById('uploadFields').style.display = currentMode === 'upload' ? '' : 'none';
      document.getElementById('onlineFields').style.display = currentMode === 'online' ? '' : 'none';
      document.getElementById('submitBtn').textContent = currentMode === 'upload' ? 'Upload Track' : 'Add Track';
    });
  });

  // Search
  document.getElementById('search').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    if (!q) { load(); return; }
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    renderList(data.results || [], true);
  }, 250));

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  async function load() {
    const url = currentTab === 'meditation' ? '/api/sounds'
              : currentTab === 'nature' ? '/api/nature' : '/api/guided';
    const res = await fetch(url);
    const data = await res.json();
    const list = data.sounds || data.meditations || [];
    renderList(list, false);
  }

  function renderList(list, isSearch) {
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><div class="icon">♪</div>No tracks yet.</div>';
      return;
    }
    grid.innerHTML = list.map(s => \`
      <div class="card">
        \${s.thumbnail ? \`<img src="\${s.thumbnail}" loading="lazy" onerror="this.style.display='none'">\` : ''}
        <h3>\${escapeHtml(s.title)}</h3>
        <p>\${escapeHtml(s.description || '')}\${s.duration ? ' · ' + s.duration : ''}\${s.instructor ? ' · with ' + escapeHtml(s.instructor) : ''}</p>
        <div class="player" data-src="\${s.audioUrl}">
          <button class="pp" onclick="togglePlay(this)">▶</button>
          <div class="bar" onclick="seek(event, this)"><div class="fill"></div></div>
          <span class="time">0:00</span>
          <span class="src \${s.source === 'online' ? 'online' : ''}">\${s.source === 'online' ? 'ONLINE' : 'LOCAL'}</span>
        </div>
        <div class="row">
          <span class="pill">\${s.category || currentTab}</span>
          <button class="like" onclick="like('\${s.id}')">♥ \${s.likes || 0}</button>
          <button class="del" onclick="del('\${s.id}')">Delete</button>
        </div>
      </div>
    \`).join('');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function togglePlay(btn) {
    const player = btn.closest('.player');
    const url = player.dataset.src;
    const fill = player.querySelector('.fill');
    const timeEl = player.querySelector('.time');
    const bar = player.querySelector('.bar');

    if (activeAudio && activeAudio.dataset.owner === url && !activeAudio.paused) {
      activeAudio.pause();
      btn.textContent = '▶';
      return;
    }
    if (activeAudio) {
      activeAudio.pause();
      document.querySelectorAll('.player .pp').forEach(b => b.textContent = '▶');
    }
    if (!activeAudio || activeAudio.dataset.owner !== url) {
      activeAudio = new Audio(url);
      activeAudio.dataset.owner = url;
      activeAudio.crossOrigin = 'anonymous';
      activeAudio.addEventListener('timeupdate', () => {
        if (!activeAudio.duration) return;
        fill.style.width = (activeAudio.currentTime / activeAudio.duration * 100) + '%';
        timeEl.textContent = fmt(activeAudio.currentTime);
      });
      activeAudio.addEventListener('ended', () => { btn.textContent = '▶'; fill.style.width = '0%'; });
      activeAudio.addEventListener('error', () => { showToast('Cannot load audio'); });
    }
    activeAudio.play().then(() => { btn.textContent = '❚❚'; }).catch(() => showToast('Play blocked'));
  }

  function seek(e, bar) {
    if (!activeAudio || !activeAudio.duration) return;
    const rect = bar.getBoundingClientRect();
    const p = (e.clientX - rect.left) / rect.width;
    activeAudio.currentTime = p * activeAudio.duration;
  }

  async function submitTrack() {
    const type = document.getElementById('type').value;
    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const duration = document.getElementById('duration').value.trim();
    const instructor = document.getElementById('instructor').value.trim();

    if (!title) { showToast('Title required'); return; }

    if (currentMode === 'upload') {
      const audioFile = document.getElementById('audioInput').files[0];
      if (!audioFile) { showToast('Pick an audio file'); return; }
      const fd = new FormData();
      fd.append('type', type);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('duration', duration);
      fd.append('instructor', instructor);
      fd.append('audio', audioFile);
      const thumb = document.getElementById('thumbInput').files[0];
      if (thumb) fd.append('thumbnail', thumb);
      uploadWithProgress('/api/admin/upload', fd);
    } else {
      const audioUrl = document.getElementById('onlineAudio').value.trim();
      if (!audioUrl) { showToast('Audio URL required'); return; }
      const body = {
        type, title, description, duration, instructor,
        audioUrl,
        thumbnail: document.getElementById('onlineThumb').value.trim()
      };
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const res = await fetch('/api/admin/sounds', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) { showToast('Added!'); resetForm(); switchTo(type); }
        else showToast('Failed');
      } catch (e) { showToast('Network error'); }
      btn.disabled = false; btn.textContent = 'Add Track';
    }
  }

  function uploadWithProgress(url, fd) {
    const btn = document.getElementById('submitBtn');
    const progress = document.getElementById('progress');
    const bar = document.getElementById('progressBar');
    btn.disabled = true; btn.textContent = 'Uploading…';
    progress.classList.add('show'); bar.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100) + '%';
    };
    xhr.onload = () => {
      btn.disabled = false; btn.textContent = 'Upload Track';
      progress.classList.remove('show');
      if (xhr.status === 200) {
        showToast('Uploaded!'); resetForm();
        switchTo(document.getElementById('type').value);
      } else showToast('Upload failed');
    };
    xhr.onerror = () => {
      btn.disabled = false; btn.textContent = 'Upload Track';
      progress.classList.remove('show'); showToast('Network error');
    };
    xhr.open('POST', url); xhr.send(fd);
  }

  function resetForm() {
    ['title','description','duration','instructor','onlineAudio','onlineThumb'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('audioInput').value = '';
    document.getElementById('thumbInput').value = '';
    document.getElementById('audioName').textContent = '';
    document.getElementById('thumbName').textContent = '';
  }

  function switchTo(type) {
    const t = document.querySelector('.tab[data-tab="' + type + '"]');
    if (t) t.click(); else load();
  }

  async function like(id) {
    const res = await fetch('/api/like/' + id, { method: 'POST' });
    const data = await res.json();
    showToast('Liked ♥');
    load();
  }

  async function del(id) {
    if (!confirm('Delete this track?')) return;
    await fetch('/api/admin/sounds/' + id, { method: 'DELETE' });
    showToast('Deleted'); load();
  }

  // File pickers
  const audioInput = document.getElementById('audioInput');
  const thumbInput = document.getElementById('thumbInput');
  const dropAudio = document.getElementById('dropAudio');
  const dropThumb = document.getElementById('dropThumb');
  const audioName = document.getElementById('audioName');
  const thumbName = document.getElementById('thumbName');

  dropAudio.addEventListener('click', () => audioInput.click());
  dropThumb.addEventListener('click', () => thumbInput.click());
  audioInput.addEventListener('change', () => audioName.textContent = audioInput.files[0]?.name || '');
  thumbInput.addEventListener('change', () => thumbName.textContent = thumbInput.files[0]?.name || '');

  [dropAudio, dropThumb].forEach((zone, i) => {
    ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0]; if (!f) return;
      if (i === 0 && f.type.startsWith('audio')) { audioInput.files = e.dataTransfer.files; audioName.textContent = f.name; }
      else if (i === 1 && f.type.startsWith('image')) { thumbInput.files = e.dataTransfer.files; thumbName.textContent = f.name; }
    });
  });

  load();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`✓ Medito backend running on :${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
  console.log(`  Uploads: ${UPLOAD_DIR}`);
});
