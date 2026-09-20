// ============================================================
// SERENE BACKEND — Meditation & Sound Management
// Single file: API + Admin Panel (no separate index.html)
// ============================================================

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/serene';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// Upload directories
['uploads/meditations/audio', 'uploads/meditations/thumbs',
 'uploads/sounds/audio', 'uploads/sounds/thumbs']
  .forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cat = req.uploadCategory || 'meditations';
    const kind = file.fieldname === 'audio' ? 'audio' : 'thumbs';
    cb(null, `uploads/${cat}/${kind}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    cb(null, id + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } });

const meditationUpload = (req, res, next) => { req.uploadCategory = 'meditations'; next(); };
const soundUpload = (req, res, next) => { req.uploadCategory = 'sounds'; next(); };

const uploadFields = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Schemas
const commonFields = {
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  tags: [{ type: String }],
  audioUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 },
  fileSize: { type: Number, default: 0 },
  sortOrder: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
};

const Meditation = mongoose.model('Meditation', new mongoose.Schema(commonFields));
const Sound = mongoose.model('Sound', new mongoose.Schema(commonFields));

// ============================================================
// Helpers — FORCE HTTPS URLS (Render proxies over HTTP but serves HTTPS)
// ============================================================
const baseUrl = (req) => {
  const envBase = process.env.BASE_URL;
  if (envBase && envBase.startsWith('http')) {
    return envBase.replace(/^http:\/\//, 'https://');
  }
  const host = req.get('host');
  return `https://${host}`;
};

const buildFileUrl = (req, filePath) => {
  if (!filePath) return '';
  const clean = filePath.replace(/\\/g, '/');
  return `${baseUrl(req)}/${clean}`;
};

const extractRelative = (url, category, kind) => {
  const m = url && url.match(new RegExp(`uploads/${category}/${kind}/[^/]+$`));
  return m ? m[0] : null;
};

// ============================================================
// API: MEDITATIONS
// ============================================================
app.get('/api/meditations', async (req, res) => {
  try {
    const q = {};
    if (req.query.published === 'true') q.isPublished = true;
    if (req.query.active === 'true') q.isActive = true;
    res.json({ items: await Meditation.find(q).sort({ sortOrder: 1, createdAt: -1 }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/meditations', meditationUpload, uploadFields, async (req, res) => {
  try {
    const audio = req.files?.audio?.[0];
    if (!audio) return res.status(400).json({ error: 'Audio required' });
    const thumb = req.files?.thumbnail?.[0];
    const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const doc = await Meditation.create({
      title: req.body.title || 'Untitled',
      description: req.body.description || '',
      category: req.body.category || 'General',
      tags,
      audioUrl: buildFileUrl(req, audio.path),
      thumbnailUrl: thumb ? buildFileUrl(req, thumb.path) : '',
      durationSeconds: parseInt(req.body.durationSeconds || '0', 10),
      fileSize: audio.size,
      sortOrder: parseInt(req.body.sortOrder || '0', 10),
      isPublished: req.body.isPublished !== 'false',
      isFeatured: req.body.isFeatured === 'true',
      isActive: req.body.isActive !== 'false'
    });
    res.json({ ok: true, item: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/meditations/:id', meditationUpload, uploadFields, async (req, res) => {
  try {
    const doc = await Meditation.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const audio = req.files?.audio?.[0];
    if (audio) {
      const old = extractRelative(doc.audioUrl, 'meditations', 'audio');
      if (old) fs.unlink(old, () => {});
      doc.audioUrl = buildFileUrl(req, audio.path);
      doc.fileSize = audio.size;
    }
    const thumb = req.files?.thumbnail?.[0];
    if (thumb) {
      const old = extractRelative(doc.thumbnailUrl, 'meditations', 'thumbs');
      if (old) fs.unlink(old, () => {});
      doc.thumbnailUrl = buildFileUrl(req, thumb.path);
    }
    if (req.body.title !== undefined) doc.title = req.body.title;
    if (req.body.description !== undefined) doc.description = req.body.description;
    if (req.body.category !== undefined) doc.category = req.body.category;
    if (req.body.tags !== undefined) doc.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (req.body.durationSeconds !== undefined) doc.durationSeconds = parseInt(req.body.durationSeconds, 10);
    if (req.body.sortOrder !== undefined) doc.sortOrder = parseInt(req.body.sortOrder, 10);
    if (req.body.isPublished !== undefined) doc.isPublished = req.body.isPublished === 'true';
    if (req.body.isFeatured !== undefined) doc.isFeatured = req.body.isFeatured === 'true';
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive === 'true';
    doc.updatedAt = new Date();
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/meditations/:id', async (req, res) => {
  try {
    const doc = await Meditation.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const a = extractRelative(doc.audioUrl, 'meditations', 'audio');
    if (a) fs.unlink(a, () => {});
    const t = extractRelative(doc.thumbnailUrl, 'meditations', 'thumbs');
    if (t) fs.unlink(t, () => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: SOUNDS
// ============================================================
app.get('/api/sounds', async (req, res) => {
  try {
    const q = {};
    if (req.query.published === 'true') q.isPublished = true;
    if (req.query.active === 'true') q.isActive = true;
    res.json({ items: await Sound.find(q).sort({ sortOrder: 1, createdAt: -1 }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sounds/:id', async (req, res) => {
  try {
    const doc = await Sound.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sounds', soundUpload, uploadFields, async (req, res) => {
  try {
    const audio = req.files?.audio?.[0];
    if (!audio) return res.status(400).json({ error: 'Audio required' });
    const thumb = req.files?.thumbnail?.[0];
    const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const doc = await Sound.create({
      title: req.body.title || 'Untitled',
      description: req.body.description || '',
      category: req.body.category || 'Ambient',
      tags,
      audioUrl: buildFileUrl(req, audio.path),
      thumbnailUrl: thumb ? buildFileUrl(req, thumb.path) : '',
      durationSeconds: parseInt(req.body.durationSeconds || '0', 10),
      fileSize: audio.size,
      sortOrder: parseInt(req.body.sortOrder || '0', 10),
      isPublished: req.body.isPublished !== 'false',
      isFeatured: req.body.isFeatured === 'true',
      isActive: req.body.isActive !== 'false'
    });
    res.json({ ok: true, item: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sounds/:id', soundUpload, uploadFields, async (req, res) => {
  try {
    const doc = await Sound.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const audio = req.files?.audio?.[0];
    if (audio) {
      const old = extractRelative(doc.audioUrl, 'sounds', 'audio');
      if (old) fs.unlink(old, () => {});
      doc.audioUrl = buildFileUrl(req, audio.path);
      doc.fileSize = audio.size;
    }
    const thumb = req.files?.thumbnail?.[0];
    if (thumb) {
      const old = extractRelative(doc.thumbnailUrl, 'sounds', 'thumbs');
      if (old) fs.unlink(old, () => {});
      doc.thumbnailUrl = buildFileUrl(req, thumb.path);
    }
    if (req.body.title !== undefined) doc.title = req.body.title;
    if (req.body.description !== undefined) doc.description = req.body.description;
    if (req.body.category !== undefined) doc.category = req.body.category;
    if (req.body.tags !== undefined) doc.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (req.body.durationSeconds !== undefined) doc.durationSeconds = parseInt(req.body.durationSeconds, 10);
    if (req.body.sortOrder !== undefined) doc.sortOrder = parseInt(req.body.sortOrder, 10);
    if (req.body.isPublished !== undefined) doc.isPublished = req.body.isPublished === 'true';
    if (req.body.isFeatured !== undefined) doc.isFeatured = req.body.isFeatured === 'true';
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive === 'true';
    doc.updatedAt = new Date();
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sounds/:id', async (req, res) => {
  try {
    const doc = await Sound.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const a = extractRelative(doc.audioUrl, 'sounds', 'audio');
    if (a) fs.unlink(a, () => {});
    const t = extractRelative(doc.thumbnailUrl, 'sounds', 'thumbs');
    if (t) fs.unlink(t, () => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'serene-backend', version: '2.1' });
});

// ============================================================
// ADMIN PANEL — served directly from index.js
// ============================================================
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Serene Admin Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:#0f1115;color:#e6e8eb;min-height:100vh}
.app{display:flex;min-height:100vh}
.sidebar{width:220px;background:#16181d;border-right:1px solid #23262d;padding:20px 0;display:flex;flex-direction:column}
.logo{padding:0 24px 24px;font-size:18px;font-weight:700;color:#a5b4fc;border-bottom:1px solid #23262d;margin-bottom:16px}
.nav-item{padding:14px 24px;cursor:pointer;color:#9aa0a6;display:flex;align-items:center;gap:10px;font-size:14px;border-left:3px solid transparent;transition:all .15s}
.nav-item:hover{background:#1d2026;color:#e6e8eb}
.nav-item.active{background:#1d2026;color:#a5b4fc;border-left-color:#a5b4fc;font-weight:600}
.main{flex:1;padding:32px 40px;overflow-y:auto}
.page{display:none}.page.active{display:block}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.header h1{font-size:22px;font-weight:700}
.header .sub{color:#9aa0a6;font-size:13px;margin-top:4px}
.btn{padding:10px 18px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:#6366f1;color:#fff}.btn-primary:hover{background:#4f46e5}
.btn-secondary{background:#23262d;color:#e6e8eb}
.btn-danger{background:#ef4444;color:#fff}
.btn-sm{padding:6px 12px;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{background:#16181d;border:1px solid #23262d;border-radius:12px;overflow:hidden}
.card-thumb{width:100%;aspect-ratio:16/9;background:#23262d;object-fit:cover;display:block}
.card-body{padding:14px}
.card-title{font-size:14px;font-weight:600;margin-bottom:4px}
.card-meta{font-size:12px;color:#9aa0a6;margin-bottom:10px}
.badges{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px}
.badge{font-size:10px;padding:3px 8px;border-radius:10px;font-weight:600;text-transform:uppercase}
.badge-pub{background:#10b98122;color:#10b981}
.badge-draft{background:#f59e0b22;color:#f59e0b}
.badge-feat{background:#a855f722;color:#a855f7}
.badge-off{background:#ef444422;color:#ef4444}
.card-actions{display:flex;gap:6px;flex-wrap:wrap}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px}
.modal-overlay.open{display:flex}
.modal{background:#16181d;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;padding:24px;border:1px solid #23262d}
.modal h2{font-size:18px;margin-bottom:20px}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:12px;color:#9aa0a6;margin-bottom:6px;font-weight:600}
.form-group input[type=text],.form-group input[type=number],.form-group textarea{width:100%;padding:10px 12px;border:1px solid #23262d;border-radius:8px;background:#0f1115;color:#e6e8eb;font-size:14px;font-family:inherit}
.form-group textarea{resize:vertical;min-height:60px}
.form-group input[type=file]{padding:8px;background:#0f1115;border:1px dashed #353a44;border-radius:8px;color:#9aa0a6;width:100%;font-size:13px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.checkbox-row{display:flex;gap:20px;padding:12px 0;flex-wrap:wrap}
.checkbox-row label{display:flex;align-items:center;gap:6px;color:#e6e8eb;font-size:13px;cursor:pointer;text-transform:none;font-weight:500}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #23262d}
.empty{text-align:center;padding:60px 20px;color:#6b7280;font-size:14px}
.toast{position:fixed;bottom:24px;right:24px;background:#10b981;color:#fff;padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600;transform:translateY(100px);opacity:0;transition:all .3s;z-index:2000}
.toast.show{transform:translateY(0);opacity:1}
.toast.error{background:#ef4444}
.loading{text-align:center;padding:40px;color:#6b7280}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #23262d;border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.progress-bar{width:100%;height:6px;background:#23262d;border-radius:3px;overflow:hidden;margin-top:12px}
.progress-fill{height:100%;background:#6366f1;width:0%;transition:width .3s}
.progress-text{font-size:11px;color:#9aa0a6;margin-top:4px;text-align:center}
@media(max-width:768px){.app{flex-direction:column}.sidebar{width:100%;flex-direction:row;padding:8px;overflow-x:auto}.logo{display:none}.nav-item{padding:10px 16px;white-space:nowrap;border-left:none;border-bottom:3px solid transparent}.nav-item.active{border-left:none;border-bottom-color:#a5b4fc}.main{padding:20px}.form-row{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">
  <div class="sidebar">
    <div class="logo">🧘 Serene Admin</div>
    <div class="nav-item active" onclick="switchPage('meditations',this)">🎵 Meditation</div>
    <div class="nav-item" onclick="switchPage('sounds',this)">🌧️ Sounds</div>
  </div>
  <div class="main">
    <div class="page active" id="page-meditations">
      <div class="header">
        <div><h1>Meditation Management</h1><div class="sub">Upload and manage guided meditations</div></div>
        <button class="btn btn-primary" onclick="openForm('meditation')">+ Add Meditation</button>
      </div>
      <div id="grid-meditations" class="grid"><div class="loading"><div class="spinner"></div></div></div>
    </div>
    <div class="page" id="page-sounds">
      <div class="header">
        <div><h1>Background Sounds</h1><div class="sub">Manage ambient background sounds</div></div>
        <button class="btn btn-primary" onclick="openForm('sound')">+ Add Sound</button>
      </div>
      <div id="grid-sounds" class="grid"><div class="loading"><div class="spinner"></div></div></div>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal">
  <div class="modal">
    <h2 id="modal-title">Add Item</h2>
    <form id="item-form">
      <input type="hidden" id="item-type">
      <input type="hidden" id="item-id">
      <div class="form-group"><label>Title *</label><input type="text" id="f-title" required></div>
      <div class="form-group"><label>Description</label><textarea id="f-description"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Category</label><input type="text" id="f-category" placeholder="Sleep, Focus, Rain..."></div>
        <div class="form-group"><label>Sort Order</label><input type="number" id="f-sort" value="0"></div>
      </div>
      <div class="form-group"><label>Duration (seconds)</label><input type="number" id="f-duration" value="0"></div>
      <div class="form-group"><label>Audio File * (mp3, wav, ogg, m4a)</label><input type="file" id="f-audio" accept="audio/*"><small id="curr-audio" style="color:#6b7280;font-size:11px;"></small></div>
      <div class="form-group"><label>Thumbnail Image</label><input type="file" id="f-thumb" accept="image/*"><small id="curr-thumb" style="color:#6b7280;font-size:11px;"></small></div>
      <div class="checkbox-row">
        <label><input type="checkbox" id="f-published" checked> Published</label>
        <label><input type="checkbox" id="f-featured"> Featured</label>
        <label><input type="checkbox" id="f-active" checked> Active</label>
      </div>
      <div class="progress-bar" id="prog-bar" style="display:none;"><div class="progress-fill" id="prog-fill"></div></div>
      <div class="progress-text" id="prog-text" style="display:none;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="submit-btn">Save</button>
      </div>
    </form>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const API=window.location.origin;
let data={meditations:[],sounds:[]};
function switchPage(n,el){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));document.getElementById('page-'+n).classList.add('active');el.classList.add('active');if(n==='meditations')loadMeditations();if(n==='sounds')loadSounds();}
async function loadMeditations(){const g=document.getElementById('grid-meditations');g.innerHTML='<div class="loading"><div class="spinner"></div></div>';try{const r=await fetch(API+'/api/meditations');const j=await r.json();data.meditations=j.items||[];renderGrid('meditation',data.meditations,g);}catch(e){g.innerHTML='<div class="empty">Error: '+e.message+'</div>';}}
async function loadSounds(){const g=document.getElementById('grid-sounds');g.innerHTML='<div class="loading"><div class="spinner"></div></div>';try{const r=await fetch(API+'/api/sounds');const j=await r.json();data.sounds=j.items||[];renderGrid('sound',data.sounds,g);}catch(e){g.innerHTML='<div class="empty">Error: '+e.message+'</div>';}}
function renderGrid(type,items,grid){if(!items.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1;">No '+type+'s yet. Click "+ Add" to create one.</div>';return;}
grid.innerHTML=items.map(item=>\`
<div class="card">
<img class="card-thumb" src="\${item.thumbnailUrl||''}" onerror="this.style.background='#23262d';this.src='';">
<div class="card-body">
<div class="card-title">\${esc(item.title)}</div>
<div class="card-meta">\${esc(item.category)} • \${fmtDur(item.durationSeconds)}</div>
<div class="badges">
\${item.isPublished?'<span class="badge badge-pub">Published</span>':'<span class="badge badge-draft">Draft</span>'}
\${item.isFeatured?'<span class="badge badge-feat">Featured</span>':''}
\${!item.isActive?'<span class="badge badge-off">Inactive</span>':''}
</div>
<div class="card-actions">
<button class="btn btn-secondary btn-sm" onclick="previewAudio('\${item.audioUrl}')">▶</button>
<button class="btn btn-secondary btn-sm" onclick="editItem('\${type}','\${item._id}')">✏️</button>
<button class="btn btn-danger btn-sm" onclick="deleteItem('\${type}','\${item._id}')">🗑️</button>
</div>
</div>
</div>\`).join('');}
function openForm(type,editId){document.getElementById('modal').classList.add('open');document.getElementById('item-type').value=type;document.getElementById('item-id').value=editId||'';document.getElementById('modal-title').textContent=editId?'Edit':(type==='meditation'?'Add Meditation':'Add Sound');document.getElementById('item-form').reset();document.getElementById('f-published').checked=true;document.getElementById('f-active').checked=true;document.getElementById('curr-audio').textContent='';document.getElementById('curr-thumb').textContent='';document.getElementById('prog-bar').style.display='none';document.getElementById('prog-text').style.display='none';
if(editId){const list=type==='meditation'?data.meditations:data.sounds;const it=list.find(i=>i._id===editId);if(it){document.getElementById('f-title').value=it.title||'';document.getElementById('f-description').value=it.description||'';document.getElementById('f-category').value=it.category||'';document.getElementById('f-sort').value=it.sortOrder||0;document.getElementById('f-duration').value=it.durationSeconds||0;document.getElementById('f-published').checked=!!it.isPublished;document.getElementById('f-featured').checked=!!it.isFeatured;document.getElementById('f-active').checked=!!it.isActive;document.getElementById('curr-audio').textContent=it.audioUrl?'Current: Uploaded ✓':'';document.getElementById('curr-thumb').textContent=it.thumbnailUrl?'Current: Uploaded ✓':'';}}}
function closeModal(){document.getElementById('modal').classList.remove('open');}
document.getElementById('item-form').addEventListener('submit',async(e)=>{e.preventDefault();const type=document.getElementById('item-type').value;const id=document.getElementById('item-id').value;const isEdit=!!id;const fd=new FormData();fd.append('title',document.getElementById('f-title').value);fd.append('description',document.getElementById('f-description').value);fd.append('category',document.getElementById('f-category').value);fd.append('durationSeconds',document.getElementById('f-duration').value);fd.append('sortOrder',document.getElementById('f-sort').value);fd.append('isPublished',document.getElementById('f-published').checked?'true':'false');fd.append('isFeatured',document.getElementById('f-featured').checked?'true':'false');fd.append('isActive',document.getElementById('f-active').checked?'true':'false');const audio=document.getElementById('f-audio').files[0];const thumb=document.getElementById('f-thumb').files[0];if(audio)fd.append('audio',audio);if(thumb)fd.append('thumbnail',thumb);if(!isEdit&&!audio)return toast('Audio file required',true);const btn=document.getElementById('submit-btn');btn.disabled=true;btn.textContent='Uploading...';const endpoint=type==='meditation'?'meditations':'sounds';const url=isEdit?API+'/api/'+endpoint+'/'+id:API+'/api/'+endpoint;const method=isEdit?'PUT':'POST';const pb=document.getElementById('prog-bar'),pf=document.getElementById('prog-fill'),pt=document.getElementById('prog-text');if(audio||thumb){pb.style.display='block';pt.style.display='block';pf.style.width='0%';pt.textContent='Uploading 0%';}const xhr=new XMLHttpRequest();xhr.open(method,url);xhr.upload.onprogress=(ev)=>{if(ev.lengthComputable){const p=Math.round((ev.loaded/ev.total)*100);pf.style.width=p+'%';pt.textContent='Uploading '+p+'%';}};xhr.onload=()=>{btn.disabled=false;btn.textContent='Save';let j={};try{j=JSON.parse(xhr.responseText);}catch(_){}if(xhr.status>=200&&xhr.status<300){toast(isEdit?'Updated ✓':'Created ✓');closeModal();if(type==='meditation')loadMeditations();else loadSounds();}else{toast('Error: '+(j.error||xhr.statusText),true);}};xhr.onerror=()=>{btn.disabled=false;btn.textContent='Save';toast('Network error',true);};xhr.send(fd);});
function editItem(t,id){openForm(t,id);}
async function deleteItem(type,id){if(!confirm('Delete permanently?'))return;const endpoint=type==='meditation'?'meditations':'sounds';try{const r=await fetch(API+'/api/'+endpoint+'/'+id,{method:'DELETE'});if(!r.ok)throw new Error('Delete failed');toast('Deleted ✓');if(type==='meditation')loadMeditations();else loadSounds();}catch(e){toast('Error: '+e.message,true);}}
function previewAudio(u){if(!u)return toast('No audio',true);new Audio(u).play().catch(()=>toast('Cannot play',true));}
function fmtDur(s){if(!s)return '0:00';const m=Math.floor(s/60),x=s%60;return m+':'+String(x).padStart(2,'0');}
function esc(s){return(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
let toastTimer;function toast(m,err){const el=document.getElementById('toast');el.textContent=m;el.classList.toggle('error',err);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000);}
loadMeditations();
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(ADMIN_HTML);
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serene backend running on port ${PORT}`);
  console.log(`📱 Admin panel: http://localhost:${PORT}/`);
});
