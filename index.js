const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure upload directories exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded public files statically
app.use('/public', express.static(path.join(__dirname, 'public')));

// Security & API Keys
const SECRET_SALT = process.env.SECRET_SALT || "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = process.env.API_KEY || "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = process.env.ADMIN_KEY || "EmonAdmin2026SecretKey"; 

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("MongoDB Database Connected Successfully!"))
        .catch(err => console.error("MongoDB Connection Error:", err));
} else {
    console.warn("⚠️ MONGO_URI missing! Set process.env.MONGO_URI on Render Environment Variables.");
}

// Database Schemas
const userSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    expiry: { type: String, required: true },
    deviceLimit: { type: Number, default: 1 },
    loggedDevices: [{
        hwid: String,
        name: String,
        androidVer: String,
        ip: String,
        lastLogin: String
    }]
});

const configSchema = new mongoose.Schema({
    id: { type: String, default: 'global_config' },
    bannedHWIDs: [String],
    settings: {
        maintenance: { type: Boolean, default: false },
        maintenanceMsg: { type: String, default: "Login disabled by Admin!" }
    },
    announcement: {
        title: { type: String, default: "NOTICE" },
        notice: { type: String, default: "Welcome to App System!" },
        style: { type: String, default: "Information" },
        isCancelable: { type: Boolean, default: true }
    },
    update: {
        version: { type: String, default: "1.0.0" },
        downloadUrl: { type: String, default: "https://example.com/app.apk" },
        forceUpdate: { type: Boolean, default: false }
    }
});

// Sound Schema (Stored in MongoDB for zero data loss)
const soundSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    thumbnail: { type: String, required: true },
    audioUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Config = mongoose.model('Config', configSchema);
const Sound = mongoose.model('Sound', soundSchema);

// Multer Storage Setup for Audio and Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

// Helpers
async function getConfig() {
    let config = await Config.findOne({ id: 'global_config' });
    if (!config) {
        config = await Config.create({ id: 'global_config' });
    }
    return config;
}

function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

const checkAdminAuth = (req, res, next) => {
    const authHeader = req.headers['x-admin-key'] || req.query.admin_key || req.body.admin_key;
    if (authHeader !== ADMIN_KEY) {
        return res.status(403).json({ status: false, message: "Unauthorized Admin Key!" });
    }
    next();
};

// ==========================================
// 📱 CLIENT APIs (For Android App)
// ==========================================

// Client Login Endpoint
app.post('/connect/b2k', async (req, res) => {
    try {
        if (req.headers['x-api-key'] !== API_KEY) {
            return res.status(401).json({ status: false, reason: "Unauthorized API Key!" });
        }

        const config = await getConfig();

        if (config.settings.maintenance) {
            return res.json({
                status: false,
                toast: config.settings.maintenanceMsg || "Maintenance Mode Enabled!",
                reason: config.settings.maintenanceMsg || "Maintenance Mode Enabled!"
            });
        }

        const { game, user_key: userKey, serial, device_name, android_version } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (!userKey || !serial) {
            return res.json({ status: false, reason: "Key or HWID Missing!" });
        }

        if (config.bannedHWIDs.includes(serial)) {
            return res.json({ status: false, reason: "DEVICE BANNED!" });
        }

        const user = await User.findOne({ key: userKey });
        if (!user) {
            return res.json({ status: false, reason: "Invalid Key!" });
        }

        const today = new Date().toISOString().split('T')[0];
        if (today > user.expiry) {
            return res.json({ status: false, reason: "Key Expired!" });
        }

        let existingDevice = user.loggedDevices.find(dev => dev.hwid === serial);
        if (!existingDevice) {
            const limit = user.deviceLimit || 1;
            if (user.loggedDevices.length >= limit) {
                return res.json({ status: false, reason: "Device Limit Exceeded!" });
            }
            user.loggedDevices.push({
                hwid: serial,
                name: device_name || "Unknown Device",
                androidVer: android_version || "OS",
                ip: clientIp,
                lastLogin: new Date().toLocaleString()
            });
            await user.save();
        }

        const rawString = `${game || 'PUBG'}-${userKey}-${serial}-${SECRET_SALT}`;
        const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

        return res.json({
            status: true,
            data: { token: generatedToken, expiry: user.expiry },
            reason: "Login Success"
        });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ status: false, reason: "Server Error!" });
    }
});

// App Sounds Endpoint
app.get('/api/sounds', async (req, res) => {
    try {
        const sounds = await Sound.find({}).sort({ createdAt: -1 });
        res.json({
            status: "success",
            total: sounds.length,
            sounds: sounds
        });
    } catch (err) {
        res.status(500).json({ status: false, message: "Error fetching sounds" });
    }
});

// ==========================================
// 🛠️ ADMIN APIs
// ==========================================

app.post('/admin/create-key', checkAdminAuth, async (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (!key) return res.status(400).json({ status: false, message: "Key name is required!" });

    if (days) expiry = addDays(days);
    const targetExpiry = expiry || addDays(1);
    const targetLimit = parseInt(limit) || 1;

    await User.findOneAndUpdate(
        { key: key },
        { expiry: targetExpiry, deviceLimit: targetLimit },
        { upsert: true, new: true }
    );

    res.json({ status: true, message: `Key '${key}' Saved Permanently!` });
});

app.post('/admin/maintenance', checkAdminAuth, async (req, res) => {
    const { status, message } = req.body;
    const config = await getConfig();

    config.settings.maintenance = status === true || status === 'true';
    if (message) config.settings.maintenanceMsg = message;

    await config.save();
    res.json({ status: true, message: `Maintenance mode: ${config.settings.maintenance}` });
});

app.post('/admin/update-app', checkAdminAuth, async (req, res) => {
    const { version, downloadUrl, forceUpdate } = req.body;
    const config = await getConfig();

    config.update = {
        version: version || config.update.version,
        downloadUrl: downloadUrl || config.update.downloadUrl,
        forceUpdate: forceUpdate === true || forceUpdate === 'true'
    };

    await config.save();
    res.json({ status: true, message: "App Update Saved!" });
});

app.post('/admin/ban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    const config = await getConfig();

    if (hwid && !config.bannedHWIDs.includes(hwid)) {
        config.bannedHWIDs.push(hwid);
        await config.save();
    }
    res.json({ status: true, message: `HWID '${hwid}' Banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    const config = await getConfig();

    config.bannedHWIDs = config.bannedHWIDs.filter(item => item !== hwid);
    await config.save();
    res.json({ status: true, message: `HWID '${hwid}' Unbanned!` });
});

app.post('/admin/reset-hwid', checkAdminAuth, async (req, res) => {
    const { key } = req.body;
    const user = await User.findOne({ key });

    if (user) {
        user.loggedDevices = [];
        await user.save();
        res.json({ status: true, message: `HWID Reset for key: ${key}` });
    } else {
        res.json({ status: false, message: `Key not found!` });
    }
});

app.post('/admin/clean-expired', checkAdminAuth, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await User.deleteMany({ expiry: { $lt: today } });
    res.json({ status: true, message: `Cleaned ${result.deletedCount} Expired Keys!` });
});

app.post('/admin/set-announcement', checkAdminAuth, async (req, res) => {
    const { title, notice, isCancelable } = req.body;
    const config = await getConfig();

    config.announcement = {
        title: title || "NOTICE",
        notice: notice || "",
        style: "Information",
        isCancelable: isCancelable === true || isCancelable === 'true'
    };

    await config.save();
    res.json({ status: true, message: "Notice Updated!" });
});

// Sound Upload API (From Admin Panel)
app.post('/api/upload-sound', checkAdminAuth, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description } = req.body;
    const files = req.files;

    if (!files || !files.audio || !files.thumbnail) {
      return res.status(400).json({ status: false, message: "Audio and Thumbnail files are required!" });
    }

    const host = req.protocol + '://' + req.get('host');
    const audioUrl = `${host}/public/uploads/${files.audio[0].filename}`;
    const thumbnailUrl = `${host}/public/uploads/${files.thumbnail[0].filename}`;

    const newSound = new Sound({
      id: "sound_" + Date.now(),
      title: title || "Untitled Sound",
      description: description || "Meditation Ambient Track",
      thumbnail: thumbnailUrl,
      audioUrl: audioUrl
    });

    await newSound.save();
    res.json({ status: true, message: "Sound uploaded successfully!", sound: newSound });
  } catch (error) {
    res.status(500).json({ status: false, message: "Upload failed: " + error.message });
  }
});

// Delete Sound API
app.post('/api/delete-sound', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    await Sound.deleteOne({ id });
    res.json({ status: true, message: "Sound deleted successfully!" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Delete failed!" });
  }
});

// Admin All Data Fetching API
app.get('/admin/api/users', checkAdminAuth, async (req, res) => {
    const config = await getConfig();
    const usersList = await User.find({});
    const soundsList = await Sound.find({}).sort({ createdAt: -1 });
    
    const usersMap = {};
    usersList.forEach(u => {
        usersMap[u.key] = {
            expiry: u.expiry,
            deviceLimit: u.deviceLimit,
            loggedDevices: u.loggedDevices
        };
    });

    res.json({
        settings: config.settings,
        announcement: config.announcement,
        update: config.update,
        bannedHWIDs: config.bannedHWIDs,
        users: usersMap,
        sounds: soundsList
    });
});

// ==========================================
// 🎨 MATERIAL UI WEB ADMIN DASHBOARD
// ==========================================

app.get('/admin', (req, res) => {
    const adminKey = req.query.key || ADMIN_KEY;
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Control Center - Admin Dashboard</title>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
      <style>
        :root {
          --bg-color: #0F172A;
          --card-bg: #1E293B;
          --accent-blue: #3B82F6;
          --accent-green: #10B981;
          --accent-orange: #F59E0B;
          --accent-red: #EF4444;
          --text-main: #F8FAFC;
          --text-sub: #94A3B8;
          --border-color: #334155;
        }
        
        * { box-sizing: border-box; font-family: 'Roboto', sans-serif; }
        body { background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 0; }
        
        /* Sidebar Nav */
        .layout { display: flex; min-height: 100vh; }
        .sidebar { width: 260px; background-color: #020617; border-right: 1px solid var(--border-color); padding: 24px 16px; }
        .sidebar h2 { font-size: 20px; color: var(--accent-blue); display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: var(--text-sub); text-decoration: none; border-radius: 8px; font-weight: 500; cursor: pointer; margin-bottom: 8px; transition: all 0.2s; }
        .nav-item:hover, .nav-item.active { background-color: var(--card-bg); color: var(--accent-blue); }
        
        /* Main Content */
        .content { flex: 1; padding: 32px; overflow-y: auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .header h1 { font-size: 24px; font-weight: 700; margin: 0; }
        
        /* Material Cards */
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1f)); gap: 24px; }
        .card { background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .card h3 { margin-top: 0; font-size: 18px; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
        
        /* Form Inputs & Buttons */
        label { display: block; font-size: 13px; color: var(--text-sub); margin-bottom: 6px; margin-top: 12px; }
        input, select, textarea { width: 100%; padding: 10px 14px; background-color: #0F172A; border: 1px solid var(--border-color); border-radius: 8px; color: white; font-size: 14px; outline: none; }
        input:focus { border-color: var(--accent-blue); }
        
        button { border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: opacity 0.2s; margin-top: 16px; }
        button:hover { opacity: 0.9; }
        .btn-blue { background-color: var(--accent-blue); color: white; }
        .btn-green { background-color: var(--accent-green); color: white; }
        .btn-red { background-color: var(--accent-red); color: white; }
        
        /* Data Tables */
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border-color); font-size: 14px; }
        th { color: var(--text-sub); font-weight: 500; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .badge-active { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }
        
        /* Tab Sections */
        .section { display: none; }
        .section.active { display: block; }
        
        .toast { position: fixed; bottom: 20px; right: 20px; background: var(--accent-green); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: none; z-index: 1000; }
      </style>
    </head>
    <body>

    <div class="layout">
      <!-- Sidebar Nav -->
      <div class="sidebar">
        <h2><span class="material-icons-round">dashboard</span> Admin Portal</h2>
        <div class="nav-item active" onclick="switchTab('sounds')"><span class="material-icons-round">library_music</span> Sound Library</div>
        <div class="nav-item" onclick="switchTab('keys')"><span class="material-icons-round">key</span> User Keys</div>
        <div class="nav-item" onclick="switchTab('settings')"><span class="material-icons-round">tune</span> App Settings</div>
        <div class="nav-item" onclick="switchTab('bans')"><span class="material-icons-round">block</span> Ban System</div>
      </div>

      <!-- Main Content Area -->
      <div class="content">
        <div class="header">
          <h1 id="page-title">🎵 Sound Tracks & Audio Cloud</h1>
          <button class="btn-blue" onclick="loadDashboardData()"><span class="material-icons-round">refresh</span> Sync Server Data</button>
        </div>

        <!-- 1. SOUND LIBRARY TAB -->
        <div id="tab-sounds" class="section active">
          <div class="grid">
            <!-- Upload Sound Form -->
            <div class="card">
              <h3><span class="material-icons-round">cloud_upload</span> Upload New Sound Track</h3>
              <form id="uploadForm" onsubmit="uploadSoundTrack(event)">
                <label>Track Title:</label>
                <input type="text" id="soundTitle" placeholder="e.g., Heavy Rainfall" required />

                <label>Description:</label>
                <input type="text" id="soundDesc" placeholder="e.g., Deep sleep rain sound" required />

                <label>Thumbnail Image (JPG / PNG):</label>
                <input type="file" id="soundImg" accept="image/*" required />

                <label>Audio File (MP3):</label>
                <input type="file" id="soundAudio" accept="audio/*" required />

                <button type="submit" class="btn-green"><span class="material-icons-round">upload</span> Upload & Publish</button>
              </form>
            </div>

            <!-- Live Tracks List -->
            <div class="card" style="grid-column: span 2;">
              <h3><span class="material-icons-round">music_note</span> Published Sound Library</h3>
              <div id="soundsListContainer">Loading tracks...</div>
            </div>
          </div>
        </div>

        <!-- 2. USER KEYS TAB -->
        <div id="tab-keys" class="section">
          <div class="grid">
            <div class="card">
              <h3><span class="material-icons-round">add_circle</span> Create New License Key</h3>
              <label>Key Name / Code:</label>
              <input type="text" id="newKeyName" placeholder="e.g., EMON-VIP-99" />

              <label>Validity (Days):</label>
              <input type="number" id="newKeyDays" value="30" />

              <label>Device Limit:</label>
              <input type="number" id="newKeyLimit" value="1" />

              <button class="btn-blue" onclick="createKey()"><span class="material-icons-round">save</span> Save Key to MongoDB</button>
            </div>

            <div class="card" style="grid-column: span 2;">
              <h3><span class="material-icons-round">group</span> Registered Keys & Devices</h3>
              <button class="btn-red" style="margin-bottom: 12px;" onclick="cleanExpiredKeys()"><span class="material-icons-round">auto_delete</span> Clean Expired Keys</button>
              <div id="keysTableContainer">Loading keys...</div>
            </div>
          </div>
        </div>

        <!-- 3. APP SETTINGS TAB -->
        <div id="tab-settings" class="section">
          <div class="grid">
            <div class="card">
              <h3><span class="material-icons-round">build</span> Maintenance Control</h3>
              <label>Maintenance Mode Status:</label>
              <select id="maintStatus">
                <option value="false">Disable (App Active)</option>
                <option value="true">Enable (Block Login)</option>
              </select>

              <label>Notice Message:</label>
              <input type="text" id="maintMsg" placeholder="Server under maintenance!" />

              <button class="btn-orange" onclick="saveMaintenance()"><span class="material-icons-round">settings</span> Save Maintenance</button>
            </div>

            <div class="card">
              <h3><span class="material-icons-round">system_update</span> App Version Control</h3>
              <label>Latest Version:</label>
              <input type="text" id="appVersion" placeholder="1.0.1" />

              <label>Download APK URL:</label>
              <input type="text" id="appUrl" placeholder="https://..." />

              <button class="btn-blue" onclick="saveAppUpdate()"><span class="material-icons-round">cloud_download</span> Update Version Info</button>
            </div>
          </div>
        </div>

        <!-- 4. BAN SYSTEM TAB -->
        <div id="tab-bans" class="section">
          <div class="card">
            <h3><span class="material-icons-round">no_cell</span> Ban Hardware ID (HWID)</h3>
            <label>Device HWID Serial:</label>
            <input type="text" id="banHwidInput" placeholder="Enter HWID string..." />
            <button class="btn-red" onclick="banHwid()"><span class="material-icons-round">gavel</span> Ban Device</button>

            <h4 style="margin-top: 24px;">Banned Hardware List</h4>
            <div id="bannedListContainer">Loading banned devices...</div>
          </div>
        </div>

      </div>
    </div>

    <div id="toast" class="toast">Action completed successfully!</div>

    <script>
      const ADMIN_KEY = "${adminKey}";

      function switchTab(tab) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        
        document.getElementById('tab-' + tab).classList.add('active');
        event.currentTarget.classList.add('active');
      }

      function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.innerText = msg;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
      }

      async function loadDashboardData() {
        try {
          const res = await fetch('/admin/api/users', { headers: { 'x-admin-key': ADMIN_KEY } });
          const data = await res.json();

          // Render Sounds
          let soundsHtml = '<table><thead><tr><th>Thumbnail</th><th>Title</th><th>Description</th><th>Action</th></tr></thead><tbody>';
          (data.sounds || []).forEach(s => {
            soundsHtml += \`
              <tr>
                <td><img src="\${s.thumbnail}" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover;" /></td>
                <td><b>\${s.title}</b></td>
                <td>\${s.description}</td>
                <td><button class="btn-red" onclick="deleteSound('\${s.id}')"><span class="material-icons-round">delete</span> Delete</button></td>
              </tr>
            \`;
          });
          soundsHtml += '</tbody></table>';
          document.getElementById('soundsListContainer').innerHTML = soundsHtml;

          // Render Keys
          let keysHtml = '<table><thead><tr><th>Key</th><th>Expiry Date</th><th>Devices Logged</th><th>Action</th></tr></thead><tbody>';
          for (let k in data.users) {
            const u = data.users[k];
            keysHtml += \`
              <tr>
                <td><b>\${k}</b></td>
                <td><span class="badge badge-active">\${u.expiry}</span></td>
                <td>\${u.loggedDevices.length} / \${u.deviceLimit}</td>
                <td><button class="btn-orange" onclick="resetHWID('\${k}')"><span class="material-icons-round">restart_alt</span> Reset HWID</button></td>
              </tr>
            \`;
          }
          keysHtml += '</tbody></table>';
          document.getElementById('keysTableContainer').innerHTML = keysHtml;

          // Render Banned HWIDs
          let bansHtml = '<ul>';
          (data.bannedHWIDs || []).forEach(h => {
            bansHtml += \`<li style="margin-bottom: 8px;">\${h} <button class="btn-green" style="padding: 4px 8px;" onclick="unbanHWID('\${h}')">Unban</button></li>\`;
          });
          bansHtml += '</ul>';
          document.getElementById('bannedListContainer').innerHTML = bansHtml;

        } catch (e) {
          showToast('Failed to load server data!');
        }
      }

      async function uploadSoundTrack(e) {
        e.preventDefault();
        const formData = new FormData();
        formData.append('title', document.getElementById('soundTitle').value);
        formData.append('description', document.getElementById('soundDesc').value);
        formData.append('thumbnail', document.getElementById('soundImg').files[0]);
        formData.append('audio', document.getElementById('soundAudio').files[0]);

        const res = await fetch('/api/upload-sound?admin_key=' + ADMIN_KEY, {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function deleteSound(id) {
        if (!confirm('Delete sound track permanently?')) return;
        const res = await fetch('/api/delete-sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ id })
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function createKey() {
        const key = document.getElementById('newKeyName').value;
        const days = document.getElementById('newKeyDays').value;
        const limit = document.getElementById('newKeyLimit').value;

        const res = await fetch('/admin/create-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ key, days, limit })
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function resetHWID(key) {
        const res = await fetch('/admin/reset-hwid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ key })
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function cleanExpiredKeys() {
        const res = await fetch('/admin/clean-expired', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY }
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      loadDashboardData();
    </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
