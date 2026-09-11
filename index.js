// ============================================================
// Medito Glass Backend v4 — 3D Premium Edition
// CSS 3D transforms · Nature + Guided only
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
    { id: 'nat_ocean', title: 'Ocean Waves', description: 'Calm sea waves on the shore',
      thumbnail: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_2b9f6efc5f.mp3',
      source: 'online', likes: 0 },
    { id: 'nat_thunder', title: 'Distant Thunder', description: 'Rolling thunder far away',
      thumbnail: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
      source: 'online', likes: 0 },
    { id: 'nat_river', title: 'Mountain River', description: 'Water flowing over rocks',
      thumbnail: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_8a8f4c1a4e.mp3',
      source: 'online', likes: 0 }
  ];
}
if (db.guided.length === 0) {
  db.guided = [
    { id: 'guide_5', title: '5 Min Breathing', description: 'A quick mindful reset',
      thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
      duration: '5:00', instructor: 'Sarah', source: 'online', likes: 0 },
    { id: 'guide_10', title: 'Body Scan', description: 'Release tension head to toe',
      thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=800',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3',
      duration: '10:00', instructor: 'Michael', source: 'online', likes: 0 }
  ];
}
saveDb();

// ===== API =====
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
  res.json({
    nature: db.nature.length,
    guided: db.guided.length,
    total: db.nature.length + db.guided.length
  });
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
// 3D PREMIUM ADMIN UI
// ============================================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#05070A">
<title>Medito Studio — 3D Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html {
    height:100%;
    background:#05070A;
    perspective:1400px;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  body {
    min-height:100vh;
    min-height:100dvh;
    font-family:-apple-system,'SF Pro Display','Segoe UI',Roboto,sans-serif;
    color:#E6EDF3;
    background:radial-gradient(circle at 20% 10%, #0B1420 0%, #05070A 55%, #03050A 100%);
    overflow-x:hidden;
    position:relative;
    padding:20px;
    padding-top:calc(20px + env(safe-area-inset-top));
    padding-bottom:calc(80px + env(safe-area-inset-bottom));
    overscroll-behavior:none;
    -webkit-user-select:none;
    user-select:none;
    transform-style:preserve-3d;
  }

  /* ===== 3D AURORA BLOBS with rotation ===== */
  .blob {
    position:fixed; border-radius:50%; filter:blur(80px);
    pointer-events:none; z-index:0; opacity:.55;
    animation:orbit 30s linear infinite;
    will-change:transform;
    transform-style:preserve-3d;
  }
  .blob.b1 { width:560px; height:560px; top:-200px; right:-180px;
    background:radial-gradient(circle,#3B82C4 0%,rgba(59,130,196,0) 70%);
    animation-duration:34s; }
  .blob.b2 { width:520px; height:520px; bottom:-180px; left:-160px;
    background:radial-gradient(circle,#3BB8B0 0%,rgba(59,184,176,0) 70%);
    animation-duration:40s; animation-delay:-8s; }
  .blob.b3 { width:440px; height:440px; top:42%; left:38%;
    background:radial-gradient(circle,#8A5BC4 0%,rgba(138,91,196,0) 70%);
    animation-duration:36s; animation-delay:-15s; }

  @keyframes orbit {
    0%   { transform:translate3d(0,0,0) scale(1) rotateZ(0deg); }
    25%  { transform:translate3d(80px,-60px,-100px) scale(1.2) rotateZ(90deg); }
    50%  { transform:translate3d(0,80px,-50px) scale(.95) rotateZ(180deg); }
    75%  { transform:translate3d(-80px,-30px,-120px) scale(1.15) rotateZ(270deg); }
    100% { transform:translate3d(0,0,0) scale(1) rotateZ(360deg); }
  }

  /* ===== 3D FLOATING PARTICLES ===== */
  .particles { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden;
    perspective:900px; }
  .particle {
    position:absolute; width:4px; height:4px; border-radius:50%;
    background:radial-gradient(circle,#A6C8E4 0%,rgba(166,200,228,0) 70%);
    animation:flyUp linear infinite; opacity:.5;
    box-shadow:0 0 8px rgba(166,200,228,.6);
  }
  @keyframes flyUp {
    0%   { transform:translate3d(0,100vh,0) scale(.5); opacity:0; }
    10%  { opacity:.8; }
    90%  { opacity:.8; }
    100% { transform:translate3d(60px,-100px,200px) scale(1.2); opacity:0; }
  }

  .wrap { position:relative; z-index:1; max-width:1080px; margin:0 auto;
    transform-style:preserve-3d; }

  /* ===== 3D GLASS HEADER ===== */
  .header {
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px; margin:-20px -20px 20px -20px;
    background:linear-gradient(135deg,rgba(10,20,35,0.7),rgba(5,7,10,0.55));
    border-bottom:1px solid rgba(255,255,255,0.1);
    backdrop-filter:blur(30px) saturate(180%);
    -webkit-backdrop-filter:blur(30px) saturate(180%);
    box-shadow:0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1);
    padding-top:calc(16px + env(safe-area-inset-top));
    animation:headerDrop .8s cubic-bezier(.22,.9,.28,1);
    transform-style:preserve-3d;
  }
  @keyframes headerDrop {
    from { opacity:0; transform:translateY(-40px) rotateX(-15deg); }
    to   { opacity:1; transform:translateY(0) rotateX(0); }
  }
  .header h1 {
    font-size:19px; font-weight:800; letter-spacing:.2px;
    background:linear-gradient(135deg,#FFFFFF 0%,#A6C8E4 100%);
    -webkit-background-clip:text; background-clip:text;
    -webkit-text-fill-color:transparent;
  }
  .badge {
    font-size:10px; padding:5px 12px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.25),rgba(59,184,176,.18));
    border:1px solid rgba(59,130,196,.45);
    color:#B8D4EA; letter-spacing:.8px; text-transform:uppercase; font-weight:700;
    box-shadow:0 0 20px rgba(59,130,196,.3), inset 0 1px 0 rgba(255,255,255,.2);
    animation:pulseBadge 3s ease-in-out infinite;
    transform:translateZ(10px);
  }
  @keyframes pulseBadge {
    0%,100% { box-shadow:0 0 20px rgba(59,130,196,.3), inset 0 1px 0 rgba(255,255,255,.2); }
    50%     { box-shadow:0 0 30px rgba(59,184,176,.5), inset 0 1px 0 rgba(255,255,255,.3); }
  }

  /* ===== 3D STATS ===== */
  .stats-bar {
    display:flex; gap:12px; margin-bottom:18px;
    animation:statIn .8s .15s backwards cubic-bezier(.22,.9,.28,1);
    transform-style:preserve-3d;
  }
  @keyframes statIn {
    from { opacity:0; transform:translateY(40px) rotateX(-25deg) scale(.9); }
    to   { opacity:1; transform:translateY(0) rotateX(0) scale(1); }
  }
  .stat {
    flex:1; padding:16px; border-radius:20px;
    background:linear-gradient(160deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.02) 100%);
    border:1px solid rgba(255,255,255,.12);
    backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
    box-shadow:
      0 15px 35px rgba(0,0,0,.35),
      0 5px 15px rgba(0,0,0,.25),
      inset 0 1px 0 rgba(255,255,255,.2),
      inset 0 -1px 0 rgba(0,0,0,.2);
    text-align:center;
    transition:transform .4s cubic-bezier(.22,.9,.28,1), box-shadow .4s;
    transform-style:preserve-3d;
    position:relative;
  }
  .stat::after {
    content:''; position:absolute; inset:0; border-radius:20px;
    background:radial-gradient(circle at 50% 0%,rgba(59,184,176,.15),transparent 60%);
    pointer-events:none;
  }
  .stat:hover {
    transform:translateY(-6px) translateZ(30px) rotateX(5deg);
    box-shadow:
      0 25px 50px rgba(0,0,0,.5),
      0 10px 25px rgba(59,130,196,.25),
      inset 0 1px 0 rgba(255,255,255,.3);
  }
  .stat .num {
    font-size:24px; font-weight:800; letter-spacing:-.5px;
    background:linear-gradient(135deg,#FFFFFF,#A6C8E4);
    -webkit-background-clip:text; background-clip:text;
    -webkit-text-fill-color:transparent;
    transform:translateZ(15px);
  }
  .stat .lbl {
    font-size:10px; color:#8A94A6; text-transform:uppercase;
    letter-spacing:1.2px; font-weight:700; margin-top:3px;
    transform:translateZ(10px);
  }

  /* ===== 3D SEARCH ===== */
  .search-wrap {
    margin-bottom:18px; position:relative;
    animation:statIn .8s .25s backwards cubic-bezier(.22,.9,.28,1);
    transform-style:preserve-3d;
  }
  .search-wrap input {
    width:100%; padding:16px 50px 16px 22px; font-size:14px; color:#E6EDF3;
    background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.13);
    border-radius:20px; outline:none; font-family:inherit;
    backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
    box-shadow:
      0 12px 30px rgba(0,0,0,.35),
      inset 0 1px 0 rgba(255,255,255,.15),
      inset 0 -1px 0 rgba(0,0,0,.15);
    transition:all .35s cubic-bezier(.22,.9,.28,1);
    transform-style:preserve-3d;
  }
  .search-wrap input:focus {
    border-color:rgba(59,130,196,.6);
    background:linear-gradient(160deg,rgba(59,130,196,.1),rgba(59,184,176,.05));
    box-shadow:
      0 20px 45px rgba(0,0,0,.45),
      0 0 0 3px rgba(59,130,196,.15),
      inset 0 1px 0 rgba(255,255,255,.25);
    transform:translateY(-2px) translateZ(20px);
  }
  .search-wrap .icon {
    position:absolute; right:20px; top:50%; transform:translateY(-50%) translateZ(15px);
    font-size:16px; opacity:.5; pointer-events:none;
    transition:opacity .3s;
  }
  .search-wrap input:focus + .icon { opacity:.9; }

  /* ===== 3D TABS ===== */
  .tabs {
    display:flex; gap:6px; padding:7px; margin-bottom:20px;
    background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.13);
    border-radius:100px;
    backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
    box-shadow:
      0 15px 35px rgba(0,0,0,.3),
      inset 0 1px 0 rgba(255,255,255,.2),
      inset 0 -1px 0 rgba(0,0,0,.15);
    animation:statIn .8s .35s backwards cubic-bezier(.22,.9,.28,1);
    overflow-x:auto; scrollbar-width:none;
    transform-style:preserve-3d;
  }
  .tabs::-webkit-scrollbar { display:none; }
  .tab {
    flex:0 0 auto; padding:12px 24px; border-radius:100px; font-size:13px;
    font-weight:700; color:#8A94A6; cursor:pointer;
    transition:all .4s cubic-bezier(.22,.9,.28,1);
    border:none; background:transparent; letter-spacing:.3px; white-space:nowrap;
    position:relative; overflow:hidden;
    transform-style:preserve-3d;
  }
  .tab::before {
    content:''; position:absolute; inset:0; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.7),rgba(59,184,176,.55));
    opacity:0; transition:opacity .4s;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.4);
  }
  .tab:hover { color:#E6EDF3; transform:translateY(-1px); }
  .tab.active {
    color:#FFF;
    box-shadow:
      0 10px 30px rgba(59,130,196,.5),
      0 4px 12px rgba(59,184,176,.3),
      inset 0 1px 0 rgba(255,255,255,.4);
    transform:translateY(-2px) translateZ(10px);
  }
  .tab.active::before { opacity:1; }
  .tab span { position:relative; z-index:1; }

  /* ===== 3D CARDS ===== */
  .grid {
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
    gap:20px;
    perspective:1200px;
    transform-style:preserve-3d;
  }
  @media (max-width:640px) { .grid { grid-template-columns:1fr; } }

  .card {
    padding:18px; border-radius:26px;
    background:linear-gradient(160deg,rgba(255,255,255,.09) 0%,rgba(255,255,255,.025) 100%);
    border:1px solid rgba(255,255,255,.12);
    backdrop-filter:blur(26px) saturate(180%);
    -webkit-backdrop-filter:blur(26px) saturate(180%);
    box-shadow:
      0 25px 60px rgba(0,0,0,.45),
      0 10px 25px rgba(0,0,0,.3),
      inset 0 1px 0 rgba(255,255,255,.22),
      inset 0 -2px 0 rgba(0,0,0,.2);
    transition:transform .5s cubic-bezier(.22,.9,.28,1), box-shadow .5s;
    position:relative; overflow:hidden;
    animation:card3DIn .8s cubic-bezier(.22,.9,.28,1) backwards;
    transform-style:preserve-3d;
    will-change:transform;
  }
  @keyframes card3DIn {
    from { opacity:0; transform:translateY(50px) rotateX(-20deg) scale(.9); }
    to   { opacity:1; transform:translateY(0) rotateX(0) scale(1); }
  }
  .card::before {
    content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);
    transition:left 1s ease;
    pointer-events:none;
  }
  .card:hover::before { left:100%; }
  .card:hover {
    box-shadow:
      0 40px 80px rgba(0,0,0,.55),
      0 15px 35px rgba(59,130,196,.2),
      inset 0 1px 0 rgba(255,255,255,.35);
  }

  .card img {
    width:100%; height:170px; object-fit:cover; border-radius:20px;
    margin-bottom:14px;
    box-shadow:
      0 15px 35px rgba(0,0,0,.5),
      inset 0 1px 0 rgba(255,255,255,.2);
    background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
    transition:transform .6s cubic-bezier(.22,.9,.28,1);
    transform:translateZ(20px);
  }
  .card:hover img { transform:translateZ(40px) scale(1.04); }

  .card h3 {
    font-size:15px; font-weight:800; margin-bottom:5px; letter-spacing:.1px;
    display:flex; align-items:center; gap:8px;
    transform:translateZ(15px);
  }
  .card h3 .dot {
    width:7px; height:7px; border-radius:50%;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:0 0 12px rgba(59,184,176,.9);
    animation:pulseDot 2s ease-in-out infinite;
  }
  @keyframes pulseDot {
    0%,100% { transform:scale(1); opacity:1; }
    50%     { transform:scale(1.4); opacity:.7; }
  }
  .card p {
    font-size:12px; color:#9BA5B7; line-height:1.5; margin-bottom:10px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden;
    transform:translateZ(10px);
  }

  /* ===== 3D PLAYER ===== */
  .player {
    display:flex; align-items:center; gap:10px; padding:11px 13px;
    background:linear-gradient(160deg,rgba(0,0,0,.4),rgba(0,0,0,.25));
    border:1px solid rgba(255,255,255,.1);
    border-radius:18px; margin-top:10px;
    backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
    transition:all .4s cubic-bezier(.22,.9,.28,1);
    transform:translateZ(15px);
    transform-style:preserve-3d;
  }
  .player.playing {
    border-color:rgba(59,184,176,.5);
    box-shadow:
      0 0 30px rgba(59,184,176,.3),
      inset 0 1px 0 rgba(255,255,255,.2);
    transform:translateZ(25px);
  }
  .player .pp {
    width:44px; height:44px; flex:0 0 44px; border-radius:50%; border:none;
    cursor:pointer; color:#FFF; font-size:14px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:
      0 8px 25px rgba(59,130,196,.6),
      0 3px 10px rgba(59,184,176,.4),
      inset 0 2px 0 rgba(255,255,255,.4),
      inset 0 -2px 0 rgba(0,0,0,.2);
    display:flex; align-items:center; justify-content:center;
    transition:transform .25s cubic-bezier(.22,.9,.28,1), box-shadow .25s;
    position:relative;
    transform:translateZ(20px);
  }
  .player .pp::after {
    content:''; position:absolute; inset:-6px; border-radius:50%;
    border:2px solid rgba(59,184,176,.6);
    opacity:0; transition:opacity .3s;
  }
  .player.playing .pp::after {
    opacity:1; animation:ripple 2s ease-out infinite;
  }
  @keyframes ripple {
    0%   { transform:scale(1); opacity:.8; }
    100% { transform:scale(1.7); opacity:0; }
  }
  .player .pp:hover {
    transform:translateZ(30px) scale(1.05);
    box-shadow:
      0 12px 30px rgba(59,130,196,.7),
      0 0 20px rgba(59,184,176,.5),
      inset 0 2px 0 rgba(255,255,255,.5);
  }
  .player .pp:active { transform:translateZ(10px) scale(.94); }

  .player .bar {
    flex:1; height:6px; border-radius:3px; background:rgba(255,255,255,.1);
    position:relative; cursor:pointer; overflow:hidden;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.4);
  }
  .player .bar .fill {
    height:100%; width:0%; border-radius:3px;
    background:linear-gradient(90deg,#3B82C4,#3BB8B0);
    transition:width .1s linear;
    box-shadow:0 0 12px rgba(59,184,176,.8);
  }
  .player .time {
    font-size:11px; color:#A6ADC8; font-variant-numeric:tabular-nums;
    min-width:38px; text-align:right;
  }
  .player .src {
    font-size:9px; padding:3px 10px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.35),rgba(59,130,196,.15));
    color:#B8D4EA; letter-spacing:.6px; text-transform:uppercase; font-weight:700;
    border:1px solid rgba(59,130,196,.35);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.15);
  }
  .player .src.online {
    background:linear-gradient(135deg,rgba(139,91,196,.35),rgba(139,91,196,.15));
    border-color:rgba(139,91,196,.45); color:#D4BEE8;
  }

  /* ===== 3D BUTTONS ===== */
  .row { display:flex; gap:8px; align-items:center; margin-top:12px;
    transform:translateZ(10px); }

  .pill {
    font-size:10px; padding:5px 12px; border-radius:100px;
    background:linear-gradient(135deg,rgba(59,130,196,.3),rgba(59,130,196,.12));
    border:1px solid rgba(59,130,196,.4);
    color:#B8D4EA; letter-spacing:.6px; text-transform:uppercase; font-weight:700;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.15);
  }

  .like {
    padding:9px 15px; font-size:11px; border-radius:100px;
    background:linear-gradient(160deg,rgba(59,184,176,.25),rgba(59,184,176,.08));
    border:1px solid rgba(59,184,176,.45);
    color:#8FDBC8; cursor:pointer; font-weight:700;
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    position:relative; overflow:hidden;
    box-shadow:
      0 6px 18px rgba(0,0,0,.25),
      inset 0 1px 0 rgba(255,255,255,.2);
    transform:translateZ(15px);
  }
  .like:hover {
    transform:translateY(-3px) translateZ(25px);
    box-shadow:
      0 12px 25px rgba(59,184,176,.4),
      inset 0 1px 0 rgba(255,255,255,.3);
  }
  .like:active { transform:translateY(-1px) translateZ(5px) scale(.94); }

  .del {
    margin-left:auto; padding:9px 15px; font-size:11px; border-radius:100px;
    border:1px solid rgba(239,68,68,.45);
    background:linear-gradient(160deg,rgba(239,68,68,.25),rgba(239,68,68,.08));
    color:#FF8A8A; cursor:pointer; font-weight:700;
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    box-shadow:
      0 6px 18px rgba(0,0,0,.25),
      inset 0 1px 0 rgba(255,255,255,.15);
    transform:translateZ(15px);
  }
  .del:hover {
    transform:translateY(-3px) translateZ(25px);
    box-shadow:
      0 12px 25px rgba(239,68,68,.4),
      inset 0 1px 0 rgba(255,255,255,.25);
  }
  .del:active { transform:translateY(-1px) translateZ(5px) scale(.94); }

  /* ===== 3D ADD PANEL ===== */
  .add-panel {
    margin-top:32px; padding:24px; border-radius:28px;
    background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));
    border:1px solid rgba(255,255,255,.14);
    backdrop-filter:blur(26px) saturate(180%);
    -webkit-backdrop-filter:blur(26px) saturate(180%);
    box-shadow:
      0 30px 70px rgba(0,0,0,.5),
      0 12px 30px rgba(0,0,0,.3),
      inset 0 1px 0 rgba(255,255,255,.25),
      inset 0 -2px 0 rgba(0,0,0,.2);
    animation:statIn .9s .55s backwards cubic-bezier(.22,.9,.28,1);
    transform-style:preserve-3d;
  }
  .add-panel h2 {
    font-size:15px; margin-bottom:18px;
    display:flex; align-items:center; gap:10px; font-weight:800;
    transform:translateZ(15px);
  }
  .add-panel h2 .num {
    width:28px; height:28px; border-radius:50%; font-size:13px;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0); color:#FFF;
    display:flex; align-items:center; justify-content:center; font-weight:800;
    box-shadow:
      0 8px 20px rgba(59,130,196,.5),
      inset 0 2px 0 rgba(255,255,255,.4),
      inset 0 -2px 0 rgba(0,0,0,.2);
  }

  .mode-switch {
    display:flex; gap:6px; padding:6px; margin-bottom:18px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.08);
    border-radius:18px;
    box-shadow:inset 0 2px 6px rgba(0,0,0,.4);
  }
  .mode-switch button {
    flex:1; padding:12px; font-size:12px; font-weight:700;
    border-radius:13px; border:none; background:transparent; color:#8A94A6;
    cursor:pointer; transition:all .35s cubic-bezier(.22,.9,.28,1);
  }
  .mode-switch button.active {
    color:#FFF;
    background:linear-gradient(135deg,rgba(59,130,196,.6),rgba(59,184,176,.4));
    box-shadow:
      0 8px 20px rgba(59,130,196,.45),
      inset 0 1px 0 rgba(255,255,255,.35);
    transform:translateY(-2px);
  }

  .field { margin-bottom:14px; transform:translateZ(10px); }
  .field label {
    display:block; font-size:10px; color:#8A94A6; margin-bottom:7px;
    letter-spacing:1px; text-transform:uppercase; font-weight:700;
  }
  .add-panel input[type=text], .add-panel textarea, .add-panel select {
    width:100%; padding:14px 18px; font-size:13px; color:#E6EDF3;
    background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.14);
    border-radius:16px; outline:none; font-family:inherit; resize:vertical;
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.1),
      inset 0 -1px 3px rgba(0,0,0,.2);
  }
  .add-panel input:focus, .add-panel textarea:focus, .add-panel select:focus {
    border-color:rgba(59,130,196,.65);
    background:linear-gradient(160deg,rgba(59,130,196,.1),rgba(59,184,176,.04));
    box-shadow:
      0 0 0 3px rgba(59,130,196,.15),
      0 8px 20px rgba(59,130,196,.2),
      inset 0 1px 0 rgba(255,255,255,.15);
    transform:translateY(-1px);
  }

  .add-panel button.primary {
    width:100%; padding:16px; font-size:14px; font-weight:800;
    border-radius:18px; border:none; cursor:pointer; color:#FFF;
    letter-spacing:.4px; position:relative; overflow:hidden;
    background:linear-gradient(135deg,#3B82C4,#3BB8B0);
    box-shadow:
      0 16px 40px rgba(59,130,196,.5),
      0 6px 15px rgba(59,184,176,.3),
      inset 0 2px 0 rgba(255,255,255,.4),
      inset 0 -3px 0 rgba(0,0,0,.25);
    transition:all .3s cubic-bezier(.22,.9,.28,1);
    margin-top:10px;
    transform:translateZ(20px);
    transform-style:preserve-3d;
  }
  .add-panel button.primary::before {
    content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);
    transition:left .7s ease;
  }
  .add-panel button.primary:hover {
    transform:translateY(-3px) translateZ(30px);
    box-shadow:
      0 22px 55px rgba(59,130,196,.6),
      0 10px 25px rgba(59,184,176,.4),
      inset 0 2px 0 rgba(255,255,255,.5);
  }
  .add-panel button.primary:hover::before { left:100%; }
  .add-panel button.primary:active {
    transform:translateY(-1px) translateZ(10px);
    box-shadow:
      0 8px 20px rgba(59,130,196,.5),
      inset 0 3px 8px rgba(0,0,0,.3);
  }
  .add-panel button.primary:disabled {
    opacity:.55; cursor:not-allowed; transform:none;
  }

  .drop-zone {
    padding:26px; border-radius:20px; text-align:center; cursor:pointer;
    border:2px dashed rgba(255,255,255,.2);
    background:linear-gradient(160deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
    transition:all .35s cubic-bezier(.22,.9,.28,1); margin-bottom:14px;
    box-shadow:inset 0 2px 8px rgba(0,0,0,.2);
    transform-style:preserve-3d;
  }
  .drop-zone:hover, .drop-zone.drag {
    border-color:rgba(59,130,196,.75);
    background:linear-gradient(160deg,rgba(59,130,196,.12),rgba(59,184,176,.06));
    transform:translateY(-4px) translateZ(25px) rotateX(3deg);
    box-shadow:
      0 20px 45px rgba(59,130,196,.3),
      inset 0 2px 8px rgba(0,0,0,.15);
  }
  .drop-zone .icon {
    font-size:30px; margin-bottom:8px; opacity:.75;
    transition:transform .4s cubic-bezier(.22,.9,.28,1);
    display:inline-block;
  }
  .drop-zone:hover .icon { transform:scale(1.2) rotateY(20deg); }
  .drop-zone .label { font-size:12px; color:#A6ADC8; }
  .drop-zone .filename {
    font-size:11px; color:#3BB8B0; margin-top:8px; font-weight:700;
    word-break:break-all;
  }

  .progress {
    height:9px; border-radius:5px; background:rgba(255,255,255,.08);
    margin-top:14px; overflow:hidden; display:none;
    box-shadow:inset 0 2px 5px rgba(0,0,0,.4);
  }
  .progress.show { display:block; }
  .progress-bar {
    height:100%; width:0;
    background:linear-gradient(90deg,#3B82C4,#3BB8B0);
    transition:width .3s cubic-bezier(.22,.9,.28,1);
    box-shadow:0 0 15px rgba(59,184,176,.8);
    position:relative;
  }
  .progress-bar::after {
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);
    animation:shimmer 1.5s linear infinite;
  }
  @keyframes shimmer {
    0%   { transform:translateX(-100%); }
    100% { transform:translateX(100%); }
  }

  .empty {
    text-align:center; color:#8A94A6; padding:70px 20px; font-size:13px;
    animation:statIn .7s cubic-bezier(.22,.9,.28,1);
  }
  .empty .icon {
    font-size:56px; opacity:.35; margin-bottom:16px;
    animation:floatIcon 3s ease-in-out infinite;
    display:inline-block;
  }
  @keyframes floatIcon {
    0%,100% { transform:translateY(0) rotateY(0); }
    50%     { transform:translateY(-10px) rotateY(15deg); }
  }

  .toast {
    position:fixed; bottom:calc(24px + env(safe-area-inset-bottom));
    left:50%; transform:translateX(-50%) translateY(140px) rotateX(-40deg); opacity:0;
    padding:15px 28px; border-radius:100px; font-size:13px; font-weight:700;
    background:linear-gradient(160deg,rgba(20,25,35,.97),rgba(10,15,25,.95));
    color:#fff; border:1px solid rgba(255,255,255,.15);
    backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
    box-shadow:
      0 25px 60px rgba(0,0,0,.6),
      inset 0 1px 0 rgba(255,255,255,.2);
    transition:all .55s cubic-bezier(.22,.9,.28,1); z-index:100;
    max-width:calc(100vw - 40px); text-align:center;
    transform-style:preserve-3d;
  }
  .toast.show {
    transform:translateX(-50%) translateY(0) rotateX(0); opacity:1;
  }
</style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="particles" id="particles"></div>

  <div class="wrap">
    <div class="header">
      <h1>Medito Studio</h1>
      <div class="badge">3D Premium ✦</div>
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

    <div class="grid" id="grid"></div>

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
        <div class="field"><label>Audio URL (mp3)</label>
          <input id="onlineAudio" type="text" placeholder="https://.../track.mp3"></div>
        <div class="field"><label>Thumbnail URL (optional)</label>
          <input id="onlineThumb" type="text" placeholder="https://.../cover.jpg"></div>
      </div>

      <div class="field"><label>Duration (guided only)</label>
        <input id="duration" type="text" placeholder="e.g. 10:00"></div>
      <div class="field"><label>Instructor (guided only)</label>
        <input id="instructor" type="text" placeholder="e.g. Sarah"></div>

      <button class="primary" id="submitBtn" onclick="submitTrack()">Add Track ✦</button>
      <div class="progress" id="progress"><div class="progress-bar" id="progressBar"></div></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

<script>
  let currentTab = 'nature';
  let currentMode = 'upload';
  const grid = document.getElementById('grid');
  const toast = document.getElementById('toast');
  let activeAudio = null;

  // ===== 3D particles =====
  (function makeParticles() {
    const box = document.getElementById('particles');
    const n = 22;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (14 + Math.random() * 16) + 's';
      p.style.animationDelay = (-Math.random() * 25) + 's';
      p.style.opacity = 0.25 + Math.random() * 0.5;
      p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
      box.appendChild(p);
    }
  })();

  // ===== 3D tilt on cards =====
  function attachTilt(card) {
    let rafId = null;
    let lastEvent = null;

    function handleMove(e) {
      lastEvent = e;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const ev = lastEvent;
        if (!ev) return;
        const rect = card.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rotateY = ((x - cx) / cx) * 8;
        const rotateX = -((y - cy) / cy) * 8;
        card.style.transform =
          'perspective(1200px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translateY(-8px) translateZ(20px) scale(1.02)';
      });
    }

    function handleLeave() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      card.style.transform = '';
    }

    card.addEventListener('mousemove', handleMove);
    card.addEventListener('mouseleave', handleLeave);
    card.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (t) handleMove({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
    card.addEventListener('touchend', handleLeave);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function fmt(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  async function refreshStats() {
    try {
      const r = await fetch('/api/stats');
      const d = await r.json();
      animateNum('statNature', d.nature);
      animateNum('statGuided', d.guided);
      animateNum('statTotal', d.total);
    } catch (_) {}
  }
  function animateNum(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const from = parseInt(el.textContent) || 0;
    const dur = 800;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (val - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
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
      document.getElementById('submitBtn').textContent =
        currentMode === 'upload' ? 'Upload Track ✦' : 'Add Track ✦';
    });
  });

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
    const url = currentTab === 'nature' ? '/api/nature' : '/api/guided';
    const res = await fetch(url);
    const data = await res.json();
    const list = data.sounds || data.meditations || [];
    renderList(list, false);
    refreshStats();
  }

  function renderList(list, isSearch) {
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><div class="icon">🎵</div>No tracks yet.<br>Add your first track below.</div>';
      return;
    }
    grid.innerHTML = list.map((s, i) => \`
      <div class="card" data-idx="\${i}" style="animation-delay:\${(i * 70)}ms">
        \${s.thumbnail ? \`<img src="\${s.thumbnail}" loading="lazy" onerror="this.style.display='none'">\` : ''}
        <h3><span class="dot"></span>\${escapeHtml(s.title)}</h3>
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

    // Attach 3D tilt to each card
    grid.querySelectorAll('.card').forEach(attachTilt);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function togglePlay(btn) {
    const player = btn.closest('.player');
    const url = player.dataset.src;

    if (activeAudio && activeAudio.dataset.owner === url && !activeAudio.paused) {
      activeAudio.pause();
      btn.textContent = '▶';
      player.classList.remove('playing');
      return;
    }
    if (activeAudio) {
      activeAudio.pause();
      document.querySelectorAll('.player .pp').forEach(b => b.textContent = '▶');
      document.querySelectorAll('.player').forEach(p => p.classList.remove('playing'));
    }
    if (!activeAudio || activeAudio.dataset.owner !== url) {
      const fill = player.querySelector('.fill');
      const timeEl = player.querySelector('.time');
      activeAudio = new Audio(url);
      activeAudio.dataset.owner = url;
      activeAudio.crossOrigin = 'anonymous';
      activeAudio.addEventListener('timeupdate', () => {
        if (!activeAudio.duration) return;
        fill.style.width = (activeAudio.currentTime / activeAudio.duration * 100) + '%';
        timeEl.textContent = fmt(activeAudio.currentTime);
      });
      activeAudio.addEventListener('ended', () => {
        btn.textContent = '▶'; fill.style.width = '0%';
        player.classList.remove('playing');
      });
      activeAudio.addEventListener('error', () => { showToast('Cannot load audio'); });
    }
    activeAudio.play().then(() => {
      btn.textContent = '❚❚';
      player.classList.add('playing');
    }).catch(() => showToast('Play blocked'));
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
        if (res.ok) { showToast('✦ Added!'); resetForm(); switchTo(type); refreshStats(); }
        else showToast('Failed');
      } catch (e) { showToast('Network error'); }
      btn.disabled = false; btn.textContent = 'Add Track ✦';
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
      btn.disabled = false; btn.textContent = 'Upload Track ✦';
      progress.classList.remove('show');
      if (xhr.status === 200) {
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
    await fetch('/api/like/' + id, { method: 'POST' });
    showToast('♥ Liked'); load();
  }

  async function del(id) {
    if (!confirm('Delete this track?')) return;
    await fetch('/api/admin/sounds/' + id, { method: 'DELETE' });
    showToast('Deleted'); load();
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
      if (i === 0 && f.type.startsWith('audio')) { audioInput.files = e.dataTransfer.files; audioName.textContent = f.name; }
      else if (i === 1 && f.type.startsWith('image')) { thumbInput.files = e.dataTransfer.files; thumbName.textContent = f.name; }
    });
  });

  // ===== Parallax on scroll =====
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    document.querySelectorAll('.blob').forEach((b, i) => {
      const speed = 0.15 + (i * 0.08);
      b.style.marginTop = (y * speed) + 'px';
    });
  }, { passive: true });

  load();
  refreshStats();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`✓ Medito 3D Premium on :${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
