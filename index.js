// ============================================================
// Medito Glass Backend v6 — PHYSICS Edition (Rapier 2D)
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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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

const DB_FILE = path.join(__dirname, 'data.json');
let db = { nature: [], guided: [] };
if (fs.existsSync(DB_FILE)) {
  try {
    const old = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.nature = old.nature || [];
    db.guided = old.guided || [];
  } catch (_) {}
}
function saveDb() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (_) {}
}

if (db.nature.length === 0) {
  db.nature = [
    { id: 'nat_rain', title: 'Gentle Rain', description: 'Soft rainfall for deep focus',
      thumbnail: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3',
      source: 'online', likes: 0 },
    { id: 'nat_ocean', title: 'Ocean Waves', description: 'Calm sea waves',
      thumbnail: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_2b9f6efc5f.mp3',
      source: 'online', likes: 0 },
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
    { id: 'guide_5', title: '5 Min Breathing', description: 'Quick mindful reset',
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

app.get('/api/nature', (req, res) => res.json({ sounds: db.nature }));
app.get('/api/guided', (req, res) => res.json({ meditations: db.guided }));
app.get('/api/sounds', (req, res) => res.json({ sounds: db.nature }));

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const all = [
    ...db.nature.map(s => ({ ...s, category: 'nature' })),
    ...db.guided.map(s => ({ ...s, category: 'guided' }))
  ].filter(s => s.title.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
  res.json({ results: all });
});

app.get('/api/stats', (req, res) => {
  res.json({ nature: db.nature.length, guided: db.guided.length, total: db.nature.length + db.guided.length });
});

app.post('/api/admin/upload',
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  (req, res) => {
    try {
      const type = (req.body.type || 'nature').toLowerCase();
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
      if (type === 'guided') db.guided.push({ ...item, duration, instructor });
      else db.nature.push(item);
      saveDb();
      res.json({ ok: true, item });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

app.post('/api/admin/sounds', (req, res) => {
  const { type, title, description, thumbnail, audioUrl, duration, instructor } = req.body;
  const id = `${(type || 'nat').slice(0,3)}_${Date.now()}`;
  const item = { id, title, description, thumbnail, audioUrl, source: 'online', likes: 0 };
  if (type === 'guided') db.guided.push({ ...item, duration, instructor });
  else db.nature.push(item);
  saveDb();
  res.json({ ok: true, item });
});

app.post('/api/like/:id', (req, res) => {
  const id = req.params.id;
  const all = [...db.nature, ...db.guided];
  const item = all.find(s => s.id === id);
  if (item) item.likes = (item.likes || 0) + 1;
  saveDb();
  res.json({ ok: true, likes: item?.likes || 0 });
});

app.delete('/api/admin/sounds/:id', (req, res) => {
  const id = req.params.id;
  for (const key of ['nature', 'guided']) {
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

// ============================================================
// LEVEL 6 — PHYSICS-DRIVEN ADMIN UI
// ============================================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#05070A">
<title>Medito Studio — Physics Edition</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html { height:100%; background:#05070A; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
  body {
    min-height:100vh; min-height:100dvh;
    font-family:-apple-system,'SF Pro Display','Segoe UI',Roboto,sans-serif;
    color:#E6EDF3;
    background:radial-gradient(circle at 20% 10%, #0B1420 0%, #05070A 55%, #03050A 100%);
    overflow-x:hidden; position:relative;
    padding:20px;
    padding-top:calc(20px + env(safe-area-inset-top));
    padding-bottom:calc(80px + env(safe-area-inset-bottom));
    overscroll-behavior:none;
    -webkit-user-select:none; user-select:none;
  }

  #three-bg { position:fixed; inset:0; z-index:0; pointer-events:none; opacity:.45; }

  .cursor-orb {
    position:fixed; width:22px; height:22px; border-radius:50%;
    pointer-events:none; z-index:9999;
    background:radial-gradient(circle,rgba(59,184,176,.9) 0%,rgba(59,184,176,0) 70%);
    box-shadow:0 0 20px rgba(59,184,176,.6);
    display:none;
  }
  @media (pointer:fine) { .cursor-orb { display:block; } }

  .blob {
    position:fixed; border-radius:50%; filter:blur(90px);
    pointer-events:none; z-index:1; opacity:.45;
    animation:orbit 30s linear infinite;
  }
  .blob.b1 { width:500px; height:500px; top:-180px; right:-160px;
    background:radial-gradient(circle,#3B82C4 0%,rgba(59,130,196,0) 70%); }
  .blob.b2 { width:480px; height:480px; bottom:-160px; left:-140px;
    background:radial-gradient(circle,#3BB8B0 0%,rgba(59,184,176,0) 70%); animation-delay:-8s; }
  .blob.b3 { width:420px; height:420px; top:42%; left:38%;
    background:radial-gradient(circle,#8A5BC4 0%,rgba(138,91,196,0) 70%); animation-delay:-15s; }
  @keyframes orbit {
    0%   { transform:translate3d(0,0,0) scale(1) rotateZ(0deg); }
    50%  { transform:translate3d(60px,60px,-80px) scale(1.15) rotateZ(180deg); }
    100% { transform:translate3d(0,0,0) scale(1) rotateZ(360deg); }
  }

  .wrap { position:relative; z-index:2; max-width:1080px; margin:0 auto; }

  .header {
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px; margin:-20px -20px 20px -20px;
    background:linear-gradient(135deg,rgba(10,20,35,0.7),rgba(5,7,10,0.5));
    border-bottom:1px solid rgba(255,255,255,0.1);
    backdrop-filter:blur(30px) saturate(180%);
    -webkit-backdrop-filter:blur(30px) saturate(180%);
    box-shadow:0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1);
    padding-top:calc(16px + env(safe-area-inset-top));
  }
  .header h1 {
    font-size:19px; font-weight:800; letter-spacing:.2px;
    background:linear-gradient(135deg,#FFFFFF 0%,#A6C8E4 100%);
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
    display:flex; align-items:center; gap:10px;
  }
  .header h1 .logo-lottie { width:26px; height:26px; display:inline-block; }
  .badge {
    font-size:10px; padding:5px 12px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.25),rgba(59,184,176,.18));
    border:1px solid rgba(59,130,196,.45);
    color:#B8D4EA; letter-spacing:.8px; text-transform:uppercase; font-weight:700;
    display:flex; align-items:center; gap:6px;
  }
  .badge .dot-live {
    width:6px; height:6px; border-radius:50%;
    background:#3BB8B0; box-shadow:0 0 10px #3BB8B0;
    animation:pulseDot 1.5s ease-in-out infinite;
  }
  @keyframes pulseDot {
    0%,100% { transform:scale(1); opacity:1; }
    50%     { transform:scale(1.4); opacity:.6; }
  }

  /* Physics Toggle Button */
  .phys-toggle {
    display:flex; align-items:center; gap:8px;
    padding:10px 16px; margin-bottom:16px;
    background:linear-gradient(135deg,rgba(139,91,196,.2),rgba(59,130,196,.15));
    border:1px solid rgba(139,91,196,.4);
    border-radius:16px; cursor:pointer;
    font-size:12px; font-weight:700; color:#E6EDF3;
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    box-shadow:0 8px 20px rgba(0,0,0,.3);
  }
  .phys-toggle:hover {
    transform:translateY(-2px);
    box-shadow:0 12px 30px rgba(139,91,196,.4);
    border-color:rgba(139,91,196,.7);
  }
  .phys-toggle.active {
    background:linear-gradient(135deg,rgba(59,184,176,.3),rgba(139,91,196,.25));
    border-color:rgba(59,184,176,.6);
    box-shadow:0 0 30px rgba(59,184,176,.4);
  }
  .phys-toggle .switch {
    width:36px; height:20px; border-radius:10px;
    background:rgba(255,255,255,.1); position:relative;
    transition:background .3s;
  }
  .phys-toggle.active .switch { background:rgba(59,184,176,.6); }
  .phys-toggle .switch::after {
    content:''; position:absolute; top:2px; left:2px;
    width:16px; height:16px; border-radius:50%; background:#FFF;
    transition:transform .3s cubic-bezier(.22,.9,.28,1);
    box-shadow:0 2px 6px rgba(0,0,0,.4);
  }
  .phys-toggle.active .switch::after { transform:translateX(16px); }
  .phys-toggle .reset-btn {
    margin-left:auto; padding:6px 12px; border-radius:10px;
    background:rgba(59,130,196,.3); border:1px solid rgba(59,130,196,.5);
    color:#FFF; font-size:11px; font-weight:700; cursor:pointer;
    display:none;
  }
  .phys-toggle.active .reset-btn { display:block; }

  .stats-bar { display:flex; gap:12px; margin-bottom:18px; }
  .stat {
    flex:1; padding:16px; border-radius:20px;
    background:linear-gradient(160deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.02) 100%);
    border:1px solid rgba(255,255,255,.12);
    backdrop-filter:blur(24px);
    box-shadow:0 15px 35px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
    text-align:center;
    transition:transform .4s cubic-bezier(.22,.9,.28,1);
  }
  .stat:hover { transform:translateY(-6px) translateZ(30px) rotateX(5deg); }
  .stat .num {
    font-size:24px; font-weight:800;
    background:linear-gradient(135deg,#FFFFFF,#A6C8E4);
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
  }
  .stat .lbl { font-size:10px; color:#8A94A6; text-transform:uppercase; letter-spacing:1.2px; font-weight:700; margin-top:3px; }

  .search-wrap { margin-bottom:18px; position:relative; }
  .search-wrap input {
    width:100%; padding:16px 50px 16px 22px; font-size:14px; color:#E6EDF3;
    background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.13);
    border-radius:20px; outline:none; font-family:inherit;
    backdrop-filter:blur(24px);
    box-shadow:0 12px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.15);
    transition:all .35s cubic-bezier(.22,.9,.28,1);
  }
  .search-wrap input:focus {
    border-color:rgba(59,130,196,.6);
    box-shadow:0 20px 45px rgba(0,0,0,.45), 0 0 0 3px rgba(59,130,196,.15);
    transform:translateY(-2px);
  }
  .search-wrap .icon { position:absolute; right:20px; top:50%; transform:translateY(-50%); font-size:16px; opacity:.5; pointer-events:none; }

  .tabs {
    display:flex; gap:6px; padding:7px; margin-bottom:20px;
    background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.13);
    border-radius:100px;
    backdrop-filter:blur(24px);
    box-shadow:0 15px 35px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.2);
    overflow-x:auto; scrollbar-width:none;
  }
  .tabs::-webkit-scrollbar { display:none; }
  .tab {
    flex:0 0 auto; padding:12px 24px; border-radius:100px; font-size:13px;
    font-weight:700; color:#8A94A6; cursor:pointer;
    transition:all .4s cubic-bezier(.22,.9,.28,1);
    border:none; background:transparent; white-space:nowrap;
    position:relative; overflow:hidden;
  }
  .tab::before {
    content:''; position:absolute; inset:0; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.7),rgba(59,184,176,.55));
    opacity:0; transition:opacity .4s;
  }
  .tab.active { color:#FFF; box-shadow:0 10px 30px rgba(59,130,196,.5); }
  .tab.active::before { opacity:1; }
  .tab span { position:relative; z-index:1; }

  /* Grid / Physics Stage */
  #stage {
    position:relative;
    min-height:500px;
    transition:height .3s;
  }

  .grid {
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
    gap:20px;
  }
  @media (max-width:640px) { .grid { grid-template-columns:1fr; } }

  /* Physics mode: cards become absolute */
  #stage.physics-mode .grid {
    display:block;
    height:0;
  }
  #stage.physics-mode .card {
    position:absolute;
    top:0; left:0;
    width:300px;
    will-change:transform;
    transform-origin:center center;
    cursor:grab;
    z-index:10;
    transition:none !important;
  }
  #stage.physics-mode .card:active { cursor:grabbing; }

  .card {
    padding:18px; border-radius:26px;
    background:linear-gradient(160deg,rgba(255,255,255,.09) 0%,rgba(255,255,255,.025) 100%);
    border:1px solid rgba(255,255,255,.12);
    backdrop-filter:blur(26px) saturate(180%);
    box-shadow:0 25px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.22);
    transition:box-shadow .5s;
    position:relative; overflow:hidden;
  }
  .card img {
    width:100%; height:170px; object-fit:cover; border-radius:20px;
    margin-bottom:14px;
    box-shadow:0 15px 35px rgba(0,0,0,.5);
    background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  }
  .card h3 {
    font-size:15px; font-weight:800; margin-bottom:5px;
    display:flex; align-items:center; gap:8px;
  }
  .card h3 .dot {
    width:7px; height:7px; border-radius:50%;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 0 12px rgba(59,184,176,.9);
  }
  .card p { font-size:12px; color:#9BA5B7; line-height:1.5; margin-bottom:10px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

  .player {
    display:flex; align-items:center; gap:10px; padding:11px 13px;
    background:linear-gradient(160deg,rgba(0,0,0,.4),rgba(0,0,0,.25));
    border:1px solid rgba(255,255,255,.1);
    border-radius:18px; margin-top:10px;
    backdrop-filter:blur(12px);
  }
  .player.playing { border-color:rgba(59,184,176,.5); box-shadow:0 0 30px rgba(59,184,176,.3); }
  .player .pp {
    width:44px; height:44px; flex:0 0 44px; border-radius:50%; border:none;
    cursor:pointer; color:#FFF; font-size:14px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 8px 25px rgba(59,130,196,.6), inset 0 2px 0 rgba(255,255,255,.4);
    display:flex; align-items:center; justify-content:center;
    transition:transform .25s;
  }
  .player .pp:active { transform:scale(.94); }
  .player .bar { flex:1; height:6px; border-radius:3px; background:rgba(255,255,255,.1); position:relative; cursor:pointer; overflow:hidden; }
  .player .bar .fill { height:100%; width:0%; border-radius:3px; background:linear-gradient(90deg,#3B82C4,#3BB8B0); }
  .player .time { font-size:11px; color:#A6ADC8; font-variant-numeric:tabular-nums; min-width:38px; text-align:right; }
  .player .src {
    font-size:9px; padding:3px 10px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.35),rgba(59,130,196,.15));
    color:#B8D4EA; letter-spacing:.6px; text-transform:uppercase; font-weight:700;
  }
  .player .src.online {
    background:linear-gradient(135deg,rgba(139,91,196,.35),rgba(139,91,196,.15));
    color:#D4BEE8;
  }

  .row { display:flex; gap:8px; align-items:center; margin-top:12px; }
  .pill {
    font-size:10px; padding:5px 12px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.3),rgba(59,130,196,.12));
    border:1px solid rgba(59,130,196,.4);
    color:#B8D4EA; letter-spacing:.6px; text-transform:uppercase; font-weight:700;
  }
  .like {
    padding:9px 15px; font-size:11px; border-radius:100px;
    background:linear-gradient(160deg,rgba(59,184,176,.25),rgba(59,184,176,.08));
    border:1px solid rgba(59,184,176,.45);
    color:#8FDBC8; cursor:pointer; font-weight:700;
  }
  .like:active { transform:scale(.94); }
  .del {
    margin-left:auto; padding:9px 15px; font-size:11px; border-radius:100px;
    border:1px solid rgba(239,68,68,.45);
    background:linear-gradient(160deg,rgba(239,68,68,.25),rgba(239,68,68,.08));
    color:#FF8A8A; cursor:pointer; font-weight:700;
  }
  .del:active { transform:scale(.94); }

  .add-panel {
    margin-top:32px; padding:24px; border-radius:28px;
    background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));
    border:1px solid rgba(255,255,255,.14);
    backdrop-filter:blur(26px);
    box-shadow:0 30px 70px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.25);
    position:relative; z-index:2;
  }
  .add-panel h2 { font-size:15px; margin-bottom:18px; display:flex; align-items:center; gap:10px; font-weight:800; }
  .add-panel h2 .num {
    width:28px; height:28px; border-radius:50%; font-size:13px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0); color:#FFF;
    display:flex; align-items:center; justify-content:center; font-weight:800;
  }

  .mode-switch {
    display:flex; gap:6px; padding:6px; margin-bottom:18px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.08);
    border-radius:18px;
  }
  .mode-switch button {
    flex:1; padding:12px; font-size:12px; font-weight:700;
    border-radius:13px; border:none; background:transparent; color:#8A94A6;
    cursor:pointer; transition:all .35s cubic-bezier(.22,.9,.28,1);
  }
  .mode-switch button.active {
    color:#FFF;
    background:linear-gradient(135deg,rgba(59,130,196,.6),rgba(59,184,176,.4));
  }

  .field { margin-bottom:14px; }
  .field label { display:block; font-size:10px; color:#8A94A6; margin-bottom:7px; letter-spacing:1px; text-transform:uppercase; font-weight:700; }
  .add-panel input[type=text], .add-panel textarea, .add-panel select {
    width:100%; padding:14px 18px; font-size:13px; color:#E6EDF3;
    background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.14);
    border-radius:16px; outline:none; font-family:inherit; resize:vertical;
  }
  .add-panel input:focus, .add-panel textarea:focus { border-color:rgba(59,130,196,.65); }

  .add-panel button.primary {
    width:100%; padding:16px; font-size:14px; font-weight:800;
    border-radius:18px; border:none; cursor:pointer; color:#FFF;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 16px 40px rgba(59,130,196,.5), inset 0 2px 0 rgba(255,255,255,.4);
    transition:all .3s;
    margin-top:10px;
  }
  .add-panel button.primary:hover { transform:translateY(-3px); box-shadow:0 22px 55px rgba(59,130,196,.6); }
  .add-panel button.primary:active { transform:translateY(-1px); }
  .add-panel button.primary:disabled { opacity:.55; cursor:not-allowed; }

  .drop-zone {
    padding:26px; border-radius:20px; text-align:center; cursor:pointer;
    border:2px dashed rgba(255,255,255,.2);
    background:linear-gradient(160deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
    transition:all .35s; margin-bottom:14px;
  }
  .drop-zone:hover, .drop-zone.drag {
    border-color:rgba(59,130,196,.75);
    background:linear-gradient(160deg,rgba(59,130,196,.12),rgba(59,184,176,.06));
    transform:translateY(-4px);
  }
  .drop-zone .icon { font-size:30px; margin-bottom:8px; opacity:.75; display:inline-block; }
  .drop-zone .label { font-size:12px; color:#A6ADC8; }
  .drop-zone .filename { font-size:11px; color:#3BB8B0; margin-top:8px; font-weight:700; word-break:break-all; }

  .progress { height:9px; border-radius:5px; background:rgba(255,255,255,.08); margin-top:14px; overflow:hidden; display:none; }
  .progress.show { display:block; }
  .progress-bar {
    height:100%; width:0;
    background:linear-gradient(90deg,#3B82C4,#3BB8B0);
    box-shadow:0 0 15px rgba(59,184,176,.8);
    position:relative;
  }
  .progress-bar::after {
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
    animation:shimmer 1.5s linear infinite;
  }
  @keyframes shimmer { 0%{transform:translateX(-100%);} 100%{transform:translateX(100%);} }

  .empty { text-align:center; color:#8A94A6; padding:70px 20px; font-size:13px; }
  .empty .icon { font-size:56px; opacity:.35; margin-bottom:16px; display:inline-block; }

  .toast {
    position:fixed; bottom:calc(24px + env(safe-area-inset-bottom));
    left:50%; transform:translateX(-50%) translateY(140px); opacity:0;
    padding:15px 28px; border-radius:100px; font-size:13px; font-weight:700;
    background:linear-gradient(160deg,rgba(20,25,35,.97),rgba(10,15,25,.95));
    color:#fff; border:1px solid rgba(255,255,255,.15);
    backdrop-filter:blur(24px);
    box-shadow:0 25px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.2);
    transition:all .55s cubic-bezier(.22,.9,.28,1); z-index:100;
    max-width:calc(100vw - 40px); text-align:center;
  }
  .toast.show { transform:translateX(-50%) translateY(0); opacity:1; }

  #loading {
    position:fixed; inset:0; z-index:9998;
    background:radial-gradient(circle at 50% 50%, #0B1420 0%, #05070A 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    transition:opacity .6s ease, visibility .6s;
  }
  #loading.hide { opacity:0; visibility:hidden; }
  #loading .lottie-box { width:120px; height:120px; }
  #loading .lbl { margin-top:20px; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#3BB8B0; font-weight:700; animation:pulseDot 1.5s ease-in-out infinite; }
</style>
</head>
<body>

<div id="loading">
  <div class="lottie-box" id="lottie-loader"></div>
  <div class="lbl">Loading Physics Studio</div>
</div>

<canvas id="three-bg"></canvas>
<div class="blob b1"></div>
<div class="blob b2"></div>
<div class="blob b3"></div>
<div class="cursor-orb" id="cursorOrb"></div>

<div class="wrap">
  <div class="header">
    <h1><span class="logo-lottie" id="lottie-logo"></span>Medito Studio</h1>
    <div class="badge"><span class="dot-live"></span>L6 · PHYSICS</div>
  </div>

  <div class="phys-toggle" id="physToggle">
    <div class="switch"></div>
    <span id="physLabel">⚡ Physics Mode: OFF</span>
    <div class="reset-btn" id="resetBtn" onclick="event.stopPropagation();resetPhysics();">RESET</div>
  </div>

  <div class="stats-bar">
    <div class="stat"><div class="num" id="statNature">0</div><div class="lbl">Nature</div></div>
    <div class="stat"><div class="num" id="statGuided">0</div><div class="lbl">Guided</div></div>
    <div class="stat"><div class="num" id="statTotal">0</div><div class="lbl">Total</div></div>
  </div>

  <div class="search-wrap">
    <input id="search" type="text" placeholder="Search all sounds…">
    <div class="icon">⌕</div>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="nature"><span>🌿 Nature</span></button>
    <button class="tab" data-tab="guided"><span>🧘 Guided</span></button>
  </div>

  <div id="stage">
    <div class="grid" id="grid"></div>
  </div>

  <div class="add-panel">
    <h2><span class="num">+</span> Add a new track</h2>
    <div class="mode-switch">
      <button class="mode active" data-mode="upload">📁 Upload file</button>
      <button class="mode" data-mode="online">🌐 Online URL</button>
    </div>
    <div class="field">
      <label>Category</label>
      <select id="type">
        <option value="nature">🌿 Nature</option>
        <option value="guided">🧘 Guided</option>
      </select>
    </div>
    <div class="field"><label>Title</label><input id="title" type="text" placeholder="e.g. Ocean Waves"></div>
    <div class="field"><label>Description</label><textarea id="description" rows="2" placeholder="Short description"></textarea></div>

    <div id="uploadFields">
      <div class="drop-zone" id="dropAudio">
        <div class="icon">♪</div>
        <div class="label">Tap to pick audio (mp3, wav, m4a)</div>
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

    <div id="onlineFields" style="display:none;">
      <div class="field"><label>Audio URL (mp3)</label><input id="onlineAudio" type="text" placeholder="https://.../track.mp3"></div>
      <div class="field"><label>Thumbnail URL (optional)</label><input id="onlineThumb" type="text" placeholder="https://.../cover.jpg"></div>
    </div>

    <div class="field"><label>Duration (guided only)</label><input id="duration" type="text" placeholder="e.g. 10:00"></div>
    <div class="field"><label>Instructor (guided only)</label><input id="instructor" type="text" placeholder="e.g. Sarah"></div>

    <button class="primary" id="submitBtn" onclick="submitTrack()">Add Track ✦</button>
    <div class="progress" id="progress"><div class="progress-bar" id="progressBar"></div></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
<script type="module">
  // ============================================================
  // 1. LOTTIE LOADER
  // ============================================================
  const lottieData = {
    v:"5.7.4", fr:30, ip:0, op:60, w:120, h:120, nm:"loader", ddd:0, assets:[],
    layers:[{ ddd:0, ind:1, ty:4, nm:"c", sr:1,
      ks:{ o:{a:1,k:[{t:0,s:[100]},{t:30,s:[20]},{t:60,s:[100]}]},
           r:{a:0,k:0}, p:{a:0,k:[60,60,0]}, a:{a:0,k:[0,0,0]},
           s:{a:1,k:[{t:0,s:[30,30,100]},{t:30,s:[100,100,100]},{t:60,s:[30,30,100]}]}},
      ao:0, shapes:[{ ty:"el", p:{a:0,k:[0,0]}, s:{a:0,k:[60,60]}, nm:"e" }],
      ip:0, op:60, st:0, bm:0 }]
  };
  lottie.loadAnimation({ container: document.getElementById('lottie-loader'), renderer:'svg', loop:true, autoplay:true, animationData:lottieData });
  lottie.loadAnimation({ container: document.getElementById('lottie-logo'), renderer:'svg', loop:true, autoplay:true, animationData:lottieData });

  // ============================================================
  // 2. THREE.JS BACKGROUND
  // ============================================================
  (function initThree(){
    const canvas = document.getElementById('three-bg');
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
    cam.position.z = 30;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const geo = new THREE.BufferGeometry();
    const N = 1500;
    const pos = new Float32Array(N*3);
    const col = new Float32Array(N*3);
    for (let i=0;i<N;i++){
      pos[i*3] = (Math.random()-0.5)*200;
      pos[i*3+1] = (Math.random()-0.5)*200;
      pos[i*3+2] = (Math.random()-0.5)*200;
      const t = Math.random();
      col[i*3] = 0.2+t*0.2; col[i*3+1] = 0.5+t*0.2; col[i*3+2] = 0.7+t*0.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size:0.4, vertexColors:true, transparent:true, opacity:0.7,
      blending: THREE.AdditiveBlending, depthWrite:false
    }));
    scene.add(stars);

    const torus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(8, 0.4, 200, 20),
      new THREE.MeshBasicMaterial({ color:0x3BB8B0, transparent:true, opacity:0.12, wireframe:true })
    );
    torus.position.set(20,-10,-30);
    scene.add(torus);

    let mx=0, my=0;
    document.addEventListener('mousemove', e => {
      mx = (e.clientX/innerWidth-0.5)*2;
      my = (e.clientY/innerHeight-0.5)*2;
    });
    (function anim(){
      requestAnimationFrame(anim);
      stars.rotation.y += 0.0003;
      torus.rotation.x += 0.004;
      torus.rotation.y += 0.006;
      cam.position.x += (mx*3-cam.position.x)*0.02;
      cam.position.y += (-my*3-cam.position.y)*0.02;
      cam.lookAt(0,0,0);
      renderer.render(scene, cam);
    })();
    addEventListener('resize', () => {
      cam.aspect = innerWidth/innerHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  })();

  // ============================================================
  // 3. CURSOR ORB
  // ============================================================
  (function(){
    if (!matchMedia('(pointer:fine)').matches) return;
    const orb = document.getElementById('cursorOrb');
    addEventListener('mousemove', e => {
      orb.style.left = (e.clientX-11)+'px';
      orb.style.top  = (e.clientY-11)+'px';
    });
  })();

  // ============================================================
  // 4. APP STATE
  // ============================================================
  let currentTab = 'nature';
  let currentMode = 'upload';
  let activeAudio = null;
  const grid = document.getElementById('grid');
  const stage = document.getElementById('stage');
  const toast = document.getElementById('toast');

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove('show'), 2600);
  }

  function fmt(s){
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s/60), ss = Math.floor(s%60);
    return m+':'+String(ss).padStart(2,'0');
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function refreshStats(){
    try {
      const r = await fetch('/api/stats');
      const d = await r.json();
      animateNum('statNature', d.nature);
      animateNum('statGuided', d.guided);
      animateNum('statTotal', d.total);
    } catch(_){}
  }
  function animateNum(id, val){
    const el = document.getElementById(id);
    if (!el) return;
    const from = parseInt(el.textContent)||0;
    const start = performance.now();
    (function tick(now){
      const t = Math.min(1,(now-start)/800);
      const e = 1 - Math.pow(1-t,3);
      el.textContent = Math.round(from + (val-from)*e);
      if (t<1) requestAnimationFrame(tick);
    })(performance.now());
  }

  // ============================================================
  // 5. UI EVENTS
  // ============================================================
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      gsap.to(t, { scale:0.92, duration:0.1, yoyo:true, repeat:1 });
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
      document.getElementById('uploadFields').style.display = currentMode==='upload'?'':'none';
      document.getElementById('onlineFields').style.display = currentMode==='online'?'':'none';
      document.getElementById('submitBtn').textContent =
        currentMode==='upload' ? 'Upload Track ✦' : 'Add Track ✦';
    });
  });

  document.getElementById('search').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    if (!q) { load(); return; }
    const res = await fetch('/api/search?q='+encodeURIComponent(q));
    const data = await res.json();
    renderList(data.results||[], true);
  }, 250));

  function debounce(fn, ms){
    let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); };
  }

  async function load(){
    const url = currentTab==='nature' ? '/api/nature' : '/api/guided';
    const res = await fetch(url);
    const data = await res.json();
    renderList(data.sounds||data.meditations||[], false);
    refreshStats();
  }

  function renderList(list, isSearch){
    if (physicsMode) { physicsDisable(); }
    if (!list.length){
      grid.innerHTML = '<div class="empty"><div class="icon">🎵</div>No tracks yet.<br>Add your first track below.</div>';
      return;
    }
    grid.innerHTML = list.map((s) => \`
      <div class="card" data-src="\${s.audioUrl}">
        \${s.thumbnail ? \`<img src="\${s.thumbnail}" loading="lazy" onerror="this.style.display='none'">\` : ''}
        <h3><span class="dot"></span>\${escapeHtml(s.title)}</h3>
        <p>\${escapeHtml(s.description||'')}\${s.duration?' · '+s.duration:''}\${s.instructor?' · with '+escapeHtml(s.instructor):''}</p>
        <div class="player" data-src="\${s.audioUrl}">
          <button class="pp" onclick="togglePlay(this)">▶</button>
          <div class="bar" onclick="seek(event, this)"><div class="fill"></div></div>
          <span class="time">0:00</span>
          <span class="src \${s.source==='online'?'online':''}">\${s.source==='online'?'ONLINE':'LOCAL'}</span>
        </div>
        <div class="row">
          <span class="pill">\${s.category||currentTab}</span>
          <button class="like" onclick="like('\${s.id}')">♥ \${s.likes||0}</button>
          <button class="del" onclick="del('\${s.id}')">Delete</button>
        </div>
      </div>
    \`).join('');

    gsap.from('.card', {
      y: 60, opacity: 0, scale: 0.92,
      duration: 0.6, stagger: 0.06, ease: 'back.out(1.3)',
      onComplete: () => document.querySelectorAll('.card').forEach(c => c.style.transform = '')
    });

    grid.querySelectorAll('.card').forEach(attachTilt);
  }

  function attachTilt(card){
    let rafId = null, lastEv = null;
    function move(e){
      lastEv = e;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const ev = lastEv; if (!ev) return;
        const r = card.getBoundingClientRect();
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const cx = r.width/2, cy = r.height/2;
        const ry = ((x-cx)/cx)*8;
        const rx = -((y-cy)/cy)*8;
        card.style.transform = 'perspective(1200px) rotateX('+rx+'deg) rotateY('+ry+'deg) translateY(-8px) scale(1.02)';
      });
    }
    function leave(){
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      card.style.transform = '';
    }
    card.addEventListener('mousemove', move);
    card.addEventListener('mouseleave', leave);
  }

  window.togglePlay = function(btn){
    const player = btn.closest('.player');
    const url = player.dataset.src;
    if (activeAudio && activeAudio.dataset.owner === url && !activeAudio.paused){
      activeAudio.pause(); btn.textContent='▶'; player.classList.remove('playing'); return;
    }
    if (activeAudio){
      activeAudio.pause();
      document.querySelectorAll('.player .pp').forEach(b=>b.textContent='▶');
      document.querySelectorAll('.player').forEach(p=>p.classList.remove('playing'));
    }
    if (!activeAudio || activeAudio.dataset.owner !== url){
      const fill = player.querySelector('.fill');
      const timeEl = player.querySelector('.time');
      activeAudio = new Audio(url);
      activeAudio.dataset.owner = url;
      activeAudio.crossOrigin = 'anonymous';
      activeAudio.addEventListener('timeupdate', ()=>{
        if (!activeAudio.duration) return;
        fill.style.width = (activeAudio.currentTime/activeAudio.duration*100)+'%';
        timeEl.textContent = fmt(activeAudio.currentTime);
      });
      activeAudio.addEventListener('ended', ()=>{
        btn.textContent='▶'; fill.style.width='0%'; player.classList.remove('playing');
      });
      activeAudio.addEventListener('error', ()=> showToast('Cannot load audio'));
    }
    activeAudio.play().then(()=>{ btn.textContent='❚❚'; player.classList.add('playing'); })
      .catch(()=>showToast('Play blocked'));
  };

  window.seek = function(e, bar){
    if (!activeAudio || !activeAudio.duration) return;
    const r = bar.getBoundingClientRect();
    activeAudio.currentTime = ((e.clientX-r.left)/r.width)*activeAudio.duration;
  };

  window.like = async function(id){
    await fetch('/api/like/'+id, { method:'POST' });
    showToast('♥ Liked'); load();
  };

  window.del = async function(id){
    if (!confirm('Delete this track?')) return;
    await fetch('/api/admin/sounds/'+id, { method:'DELETE' });
    showToast('Deleted'); load();
  };

  // ============================================================
  // 6. PHYSICS ENGINE (RAPIER 2D)
  // ============================================================
  let RAPIER = null;
  let world = null;
  let physicsMode = false;
  let bodies = []; // { el, body, collider, w, h, initialX, initialY }
  let physicsLoopId = null;
  let dragState = null;

  async function ensureRapier(){
    if (RAPIER) return true;
    try {
      const mod = await import('https://esm.sh/@dimforge/rapier2d-compat@0.14.0');
      await mod.init();
      RAPIER = mod;
      return true;
    } catch (e) {
      console.error('Rapier load failed', e);
      showToast('Physics library failed to load');
      return false;
    }
  }

  function createWalls(){
    const W = innerWidth, H = innerHeight + 200;
    const walls = [
      { x: W/2, y: -100, hw: W, hh: 50 },       // top
      { x: W/2, y: H+100, hw: W, hh: 50 },      // bottom
      { x: -100, y: H/2, hw: 50, hh: H },       // left
      { x: W+100, y: H/2, hw: 50, hh: H }       // right
    ];
    walls.forEach(w => {
      const bd = RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.y);
      const b = world.createRigidBody(bd);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w.hw, w.hh).setFriction(0.8).setRestitution(0.2), b);
    });
  }

  async function physicsEnable(){
    const ok = await ensureRapier();
    if (!ok) return;

    physicsMode = true;
    stage.classList.add('physics-mode');
    document.getElementById('physLabel').textContent = '⚡ Physics Mode: ON';
    document.getElementById('physToggle').classList.add('active');

    // Create world
    world = new RAPIER.World({ x: 0, y: 1500 });
    createWalls();

    // Compute stage height so page has room for physics pile
    const topOffset = stage.getBoundingClientRect().top + scrollY;
    stage.style.height = Math.max(600, innerHeight * 1.2) + 'px';

    // Create body for each card
    bodies = [];
    const cards = Array.from(grid.querySelectorAll('.card'));
    const stageRect = stage.getBoundingClientRect();
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const w = rect.width, h = rect.height;

      // Initial position: top of stage, staggered horizontally
      const startX = 60 + Math.random() * Math.max(60, innerWidth - w - 120);
      const startY = -200 - i * 80;

      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(startX + w/2, startY + h/2)
        .setLinearDamping(0.5)
        .setAngularDamping(0.8)
        .setCcdEnabled(true);

      const body = world.createRigidBody(bd);
      const cd = RAPIER.ColliderDesc.cuboid(w/2, h/2)
        .setFriction(0.9)
        .setRestitution(0.15)
        .setDensity(0.8);
      world.createCollider(cd, body);

      card.style.width = w + 'px';
      card.style.position = 'absolute';
      card.style.left = '0';
      card.style.top = '0';
      card.style.transform = \`translate(\${startX}px, \${startY}px)\`;
      card.dataset.stageTop = stageRect.top;

      bodies.push({ el: card, body, w, h, initialX: startX, initialY: startY });
      card.addEventListener('pointerdown', onPointerDown);
    });

    // Start loop
    let last = performance.now();
    function loop(now){
      if (!physicsMode) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      world.timestep = dt;
      world.step();

      const stageRect = stage.getBoundingClientRect();
      for (const item of bodies){
        const p = item.body.translation();
        const r = item.body.rotation();
        // Rapier gives center; we need top-left for CSS
        item.el.style.transform =
          'translate(' + (p.x - item.w/2) + 'px, ' + (p.y - item.h/2) + 'px) rotate(' + r + 'rad)';
      }
      physicsLoopId = requestAnimationFrame(loop);
    }
    physicsLoopId = requestAnimationFrame(loop);
  }

  function physicsDisable(){
    physicsMode = false;
    stage.classList.remove('physics-mode');
    stage.style.height = '';
    document.getElementById('physLabel').textContent = '⚡ Physics Mode: OFF';
    document.getElementById('physToggle').classList.remove('active');
    if (physicsLoopId) cancelAnimationFrame(physicsLoopId);
    physicsLoopId = null;
    world = null;
    bodies = [];
    dragState = null;
    document.querySelectorAll('.card').forEach(c => {
      c.style.position = '';
      c.style.left = '';
      c.style.top = '';
      c.style.transform = '';
      c.style.width = '';
      c.removeEventListener('pointerdown', onPointerDown);
    });
  }

  function onPointerDown(e){
    if (!physicsMode) return;
    if (e.target.closest('button, input, textarea, select, .player')) return;
    const card = e.currentTarget;
    const item = bodies.find(b => b.el === card);
    if (!item) return;

    e.preventDefault();
    card.setPointerCapture(e.pointerId);

    const rect = card.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const offsetX = e.clientX - (rect.left + rect.width/2);
    const offsetY = e.clientY - (rect.top + rect.height/2);

    // Switch to kinematic for dragging
    item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

    dragState = {
      item, pointerId: e.pointerId,
      offsetX, offsetY,
      lastX: e.clientX, lastY: e.clientY,
      lastT: performance.now(),
      vx: 0, vy: 0
    };

    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e){
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const now = performance.now();
    const dt = (now - dragState.lastT) / 1000 || 0.016;
    const dx = e.clientX - dragState.lastX;
    const dy = e.clientY - dragState.lastY;
    dragState.vx = dx / dt;
    dragState.vy = dy / dt;
    dragState.lastX = e.clientX;
    dragState.lastY = e.clientY;
    dragState.lastT = now;

    const stageRect = stage.getBoundingClientRect();
    const targetX = e.clientX - dragState.offsetX - stageRect.left;
    const targetY = e.clientY - dragState.offsetY - stageRect.top;

    dragState.item.body.setNextKinematicTranslation({ x: targetX, y: targetY });
  }

  function onPointerUp(e){
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const item = dragState.item;
    const vx = dragState.vx;
    const vy = dragState.vy;

    // Switch back to dynamic with velocity
    item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    // Cap velocity to avoid crazy throws
    const maxV = 2000;
    item.body.setLinvel({
      x: Math.max(-maxV, Math.min(maxV, vx)),
      y: Math.max(-maxV, Math.min(maxV, vy))
    }, true);

    item.el.removeEventListener('pointermove', onPointerMove);
    item.el.removeEventListener('pointerup', onPointerUp);
    item.el.removeEventListener('pointercancel', onPointerUp);
    dragState = null;
  }

  function resetPhysics(){
    if (!physicsMode || !bodies.length) return;
    bodies.forEach((item, i) => {
      item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      const x = 60 + Math.random() * Math.max(60, innerWidth - item.w - 120);
      const y = -200 - i * 80;
      item.body.setTranslation({ x: x + item.w/2, y: y + item.h/2 }, true);
      item.body.setRotation(0, true);
      item.body.setLinvel({ x: 0, y: 0 }, true);
      item.body.setAngvel(0, true);
    });
    showToast('✦ Re-dropped!');
  }

  document.getElementById('physToggle').addEventListener('click', async () => {
    if (physicsMode) physicsDisable();
    else await physicsEnable();
  });
  window.resetPhysics = resetPhysics;

  // ============================================================
  // 7. SUBMIT / UPLOAD / FILE PICKERS
  // ============================================================
  window.submitTrack = async function(){
    const type = document.getElementById('type').value;
    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const duration = document.getElementById('duration').value.trim();
    const instructor = document.getElementById('instructor').value.trim();

    if (!title) { showToast('Title required'); return; }

    if (currentMode === 'upload'){
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
      const body = { type, title, description, duration, instructor,
        audioUrl, thumbnail: document.getElementById('onlineThumb').value.trim() };
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const res = await fetch('/api/admin/sounds', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        });
        if (res.ok) { showToast('✦ Added!'); resetForm(); switchTo(type); refreshStats(); }
        else showToast('Failed');
      } catch(e){ showToast('Network error'); }
      btn.disabled = false; btn.textContent = 'Add Track ✦';
    }
  };

  function uploadWithProgress(url, fd){
    const btn = document.getElementById('submitBtn');
    const progress = document.getElementById('progress');
    const bar = document.getElementById('progressBar');
    btn.disabled = true; btn.textContent = 'Uploading…';
    progress.classList.add('show'); bar.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) bar.style.width = (e.loaded/e.total*100)+'%';
    };
    xhr.onload = () => {
      btn.disabled = false; btn.textContent = 'Upload Track ✦';
      progress.classList.remove('show');
      if (xhr.status === 200){
        showToast('✦ Uploaded!'); resetForm();
        switchTo(document.getElementById('type').value);
        refreshStats();
      } else showToast('Upload failed');
    };
    xhr.onerror = () => {
      btn.disabled = false; btn.textContent = 'Upload Track ✦';
      progress.classList.remove('show'); showToast('Network error');
    };
    xhr.open('POST', url); xhr.send(fd);
  }

  function resetForm(){
    ['title','description','duration','instructor','onlineAudio','onlineThumb'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('audioInput').value = '';
    document.getElementById('thumbInput').value = '';
    document.getElementById('audioName').textContent = '';
    document.getElementById('thumbName').textContent = '';
  }

  function switchTo(type){
    const t = document.querySelector('.tab[data-tab="'+type+'"]');
    if (t) t.click(); else load();
  }

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
      if (i===0 && f.type.startsWith('audio')) { audioInput.files = e.dataTransfer.files; audioName.textContent = f.name; }
      else if (i===1 && f.type.startsWith('image')) { thumbInput.files = e.dataTransfer.files; thumbName.textContent = f.name; }
    });
  });

  // Parallax blobs
  addEventListener('scroll', () => {
    const y = scrollY;
    document.querySelectorAll('.blob').forEach((b, i) => {
      b.style.marginTop = (y * (0.15 + i*0.08)) + 'px';
    });
  }, { passive: true });

  // ============================================================
  // 8. BOOT
  // ============================================================
  addEventListener('load', () => {
    setTimeout(() => document.getElementById('loading').classList.add('hide'), 900);
  });

  // Handle window resize during physics
  addEventListener('resize', () => {
    if (physicsMode) {
      // Rebuild walls
      if (world) {
        // Remove old walls by recreating world is complex — skip for simplicity
        // Just notify user to reset
      }
    }
  });

  load();
  refreshStats();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log('✓ Medito Level 6 PHYSICS on :' + PORT);
  console.log('  Admin: http://localhost:' + PORT + '/admin');
});
