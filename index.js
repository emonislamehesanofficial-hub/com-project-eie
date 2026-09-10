// ============================================================
// Medito Glass Backend — 3 endpoints + admin glass UI
// ============================================================
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// In-memory data (extend from DB later)
// ------------------------------------------------------------
let meditationSounds = [
  { id: 'med_rain', title: 'Gentle Rain', description: 'Soft rainfall for deep focus',
    thumbnail: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3' },
  { id: 'med_ocean', title: 'Ocean Waves', description: 'Calm sea waves on the shore',
    thumbnail: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_2b9f6efc5f.mp3' },
  { id: 'med_forest', title: 'Forest Ambience', description: 'Birds and gentle wind',
    thumbnail: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3' }
];

let natureSounds = [
  { id: 'nat_thunder', title: 'Distant Thunder', description: 'Rolling thunder far away',
    thumbnail: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3' },
  { id: 'nat_river', title: 'Mountain River', description: 'Flowing water over rocks',
    thumbnail: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_8a8f4c1a4e.mp3' },
  { id: 'nat_fire', title: 'Campfire', description: 'Crackling wood and warmth',
    thumbnail: 'https://images.unsplash.com/photo-1475738972911-5b44ce984c42?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_00fa5593f3.mp3' }
];

let guidedMeditations = [
  { id: 'guide_5min', title: '5 Minute Breathing', description: 'Quick reset session',
    thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    duration: '5:00', instructor: 'Sarah' },
  { id: 'guide_10min', title: 'Body Scan', description: 'Release tension head to toe',
    thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_9c1cbbdbb6.mp3',
    duration: '10:00', instructor: 'Michael' },
  { id: 'guide_15min', title: 'Deep Sleep', description: 'Wind down for rest',
    thumbnail: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_2b9f6efc5f.mp3',
    duration: '15:00', instructor: 'Elena' }
];

// ------------------------------------------------------------
// API endpoints
// ------------------------------------------------------------
app.get('/api/sounds', (req, res) => {
  res.json({ sounds: meditationSounds });
});

app.get('/api/nature', (req, res) => {
  res.json({ sounds: natureSounds });
});

app.get('/api/guided', (req, res) => {
  res.json({ meditations: guidedMeditations });
});

// Simple admin mutations (used by /admin panel)
app.post('/api/admin/sounds', (req, res) => {
  const { type, title, description, thumbnail, audioUrl } = req.body;
  const item = {
    id: `${type.slice(0,3)}_${Date.now()}`,
    title, description, thumbnail, audioUrl
  };
  if (type === 'meditation') meditationSounds.push(item);
  else if (type === 'nature') natureSounds.push(item);
  else guidedMeditations.push(item);
  res.json({ ok: true, item });
});

app.delete('/api/admin/sounds/:id', (req, res) => {
  const id = req.params.id;
  meditationSounds = meditationSounds.filter(s => s.id !== id);
  natureSounds = natureSounds.filter(s => s.id !== id);
  guidedMeditations = guidedMeditations.filter(s => s.id !== id);
  res.json({ ok: true });
});

// ------------------------------------------------------------
// ADMIN — Glass 3D UI with two tabs (Meditation + Nature)
// ------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Medito Studio — Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { min-height: 100%; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
  body {
    color: #E6EDF3;
    background: #07090D;
    overflow-x: hidden;
    position: relative;
    padding: 20px;
  }
  /* Animated colorful backdrop */
  .blob {
    position: fixed; border-radius: 50%; filter: blur(60px);
    pointer-events: none; z-index: 0; opacity: 0.7;
    animation: drift 22s ease-in-out infinite alternate;
  }
  .blob.b1 { width: 520px; height: 520px; top: -180px; right: -160px;
    background: radial-gradient(circle, #3B82C4 0%, rgba(59,130,196,0) 70%); }
  .blob.b2 { width: 480px; height: 480px; bottom: -160px; left: -140px;
    background: radial-gradient(circle, #3BB8B0 0%, rgba(59,184,176,0) 70%);
    animation-delay: -7s; }
  .blob.b3 { width: 400px; height: 400px; top: 40%; left: 35%;
    background: radial-gradient(circle, #8A5BC4 0%, rgba(138,91,196,0) 70%);
    animation-delay: -14s; }
  @keyframes drift {
    0%   { transform: translate(0, 0) scale(1); }
    50%  { transform: translate(60px, -40px) scale(1.15); }
    100% { transform: translate(-40px, 60px) scale(0.95); }
  }

  .wrap { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between;
    padding: 18px 22px; margin-bottom: 20px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 24px; backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    box-shadow: 0 20px 60px rgba(0,0,0,0.35),
                inset 0 1px 0 rgba(255,255,255,0.22); }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; }
  .header .badge { font-size: 11px; padding: 5px 12px; border-radius: 100px;
    background: rgba(59,130,196,0.22); border: 1px solid rgba(59,130,196,0.5);
    color: #A6C8E4; letter-spacing: 0.6px; text-transform: uppercase; }

  /* Tabs (glass pill) */
  .tabs { display: inline-flex; gap: 4px; padding: 5px; margin-bottom: 20px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 100px; backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.18); }
  .tab { padding: 11px 26px; border-radius: 100px; font-size: 14px;
    font-weight: 600; color: #A6ADC8; cursor: pointer;
    transition: all 0.3s cubic-bezier(0.22, 0.9, 0.28, 1);
    border: none; background: transparent; letter-spacing: 0.2px; }
  .tab:hover { color: #E6EDF3; }
  .tab.active { color: #FFFFFF;
    background: linear-gradient(135deg, rgba(59,130,196,0.5), rgba(59,184,176,0.35));
    box-shadow: 0 6px 20px rgba(59,130,196,0.35),
                inset 0 1px 0 rgba(255,255,255,0.28); }

  /* Card grid */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px; }
  .card {
    padding: 18px; border-radius: 22px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.13);
    backdrop-filter: blur(22px) saturate(180%);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    box-shadow: 0 18px 50px rgba(0,0,0,0.35),
                inset 0 1px 0 rgba(255,255,255,0.2);
    transition: transform 0.28s ease, box-shadow 0.28s ease; }
  .card:hover { transform: translateY(-4px);
    box-shadow: 0 24px 60px rgba(0,0,0,0.45),
                inset 0 1px 0 rgba(255,255,255,0.28); }
  .card img { width: 100%; height: 150px; object-fit: cover;
    border-radius: 14px; margin-bottom: 12px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
  .card h3 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .card p { font-size: 12px; color: #A6ADC8; line-height: 1.5; margin-bottom: 12px; }
  .card .row { display: flex; gap: 8px; align-items: center; }
  .card .pill { font-size: 10px; padding: 4px 10px; border-radius: 100px;
    background: rgba(59,130,196,0.2); border: 1px solid rgba(59,130,196,0.4);
    color: #A6C8E4; letter-spacing: 0.5px; text-transform: uppercase; }
  .card .del { margin-left: auto; padding: 7px 14px; font-size: 11px;
    border-radius: 100px; border: 1px solid rgba(239,68,68,0.5);
    background: rgba(239,68,68,0.15); color: #FF8A8A; cursor: pointer;
    font-weight: 600; }
  .card .del:hover { background: rgba(239,68,68,0.28); }

  /* Add panel */
  .add-panel {
    margin-top: 24px; padding: 22px; border-radius: 24px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.13);
    backdrop-filter: blur(22px) saturate(180%);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    box-shadow: 0 18px 50px rgba(0,0,0,0.35),
                inset 0 1px 0 rgba(255,255,255,0.2); }
  .add-panel h2 { font-size: 15px; margin-bottom: 14px; }
  .add-panel input, .add-panel select {
    width: 100%; padding: 12px 16px; margin-bottom: 10px; font-size: 13px;
    color: #E6EDF3; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.15); border-radius: 14px;
    outline: none; font-family: inherit; }
  .add-panel input:focus { border-color: rgba(59,130,196,0.7);
    background: rgba(255,255,255,0.08); }
  .add-panel button { width: 100%; padding: 14px; font-size: 14px;
    font-weight: 700; border-radius: 14px; border: none; cursor: pointer;
    color: #FFFFFF; letter-spacing: 0.4px;
    background: linear-gradient(135deg, #3B82C4, #3BB8B0);
    box-shadow: 0 12px 30px rgba(59,130,196,0.35),
                inset 0 1px 0 rgba(255,255,255,0.28);
    transition: transform 0.2s; }
  .add-panel button:hover { transform: translateY(-2px); }

  .empty { text-align: center; color: #A6ADC8; padding: 40px; font-size: 13px; }
  .toast { position: fixed; bottom: 24px; left: 50%;
    transform: translateX(-50%) translateY(80px); opacity: 0;
    padding: 12px 22px; border-radius: 100px; font-size: 13px;
    background: rgba(0,0,0,0.75); color: #fff;
    border: 1px solid rgba(255,255,255,0.15);
    backdrop-filter: blur(20px); transition: all 0.4s cubic-bezier(0.22, 0.9, 0.28, 1); z-index: 100; }
  .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
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

    <div class="tabs">
      <button class="tab active" data-tab="meditation">Meditation Sounds</button>
      <button class="tab" data-tab="nature">Nature Sounds</button>
    </div>

    <div class="grid" id="grid"></div>

    <div class="add-panel">
      <h2>Add new track</h2>
      <select id="type">
        <option value="meditation">Meditation</option>
        <option value="nature">Nature</option>
      </select>
      <input id="title" placeholder="Title">
      <input id="description" placeholder="Description">
      <input id="thumbnail" placeholder="Thumbnail URL">
      <input id="audioUrl" placeholder="Audio URL (mp3)">
      <button onclick="addTrack()">Add Track</button>
    </div>
  </div>

  <div class="toast" id="toast"></div>

<script>
  let currentTab = 'meditation';
  const grid = document.getElementById('grid');
  const toast = document.getElementById('toast');

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentTab = t.dataset.tab;
      load();
    });
  });

  async function load() {
    const url = currentTab === 'meditation' ? '/api/sounds' : '/api/nature';
    const res = await fetch(url);
    const data = await res.json();
    const list = data.sounds || [];
    if (!list.length) { grid.innerHTML = '<div class="empty">No tracks yet.</div>'; return; }
    grid.innerHTML = list.map(s => \`
      <div class="card">
        <img src="\${s.thumbnail}" onerror="this.style.display='none'">
        <h3>\${s.title}</h3>
        <p>\${s.description}</p>
        <div class="row">
          <span class="pill">\${currentTab}</span>
          <button class="del" onclick="del('\${s.id}')">Delete</button>
        </div>
      </div>
    \`).join('');
  }

  async function addTrack() {
    const body = {
      type: document.getElementById('type').value,
      title: document.getElementById('title').value,
      description: document.getElementById('description').value,
      thumbnail: document.getElementById('thumbnail').value,
      audioUrl: document.getElementById('audioUrl').value
    };
    if (!body.title || !body.audioUrl) { showToast('Title & audio URL required'); return; }
    await fetch('/api/admin/sounds', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    showToast('Track added');
    ['title','description','thumbnail','audioUrl'].forEach(id => document.getElementById(id).value = '');
    load();
  }

  async function del(id) {
    await fetch('/api/admin/sounds/' + id, { method: 'DELETE' });
    showToast('Deleted');
    load();
  }

  load();
</script>
</body>
</html>`);
});

// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✓ Medito backend running on port ${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
