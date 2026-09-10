const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Render / Reverse Proxy Support (Fixes HTTP to HTTPS issue)
app.set('trust proxy', 1);

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
    console.warn("⚠️ MONGO_URI missing in Environment Variables!");
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

// Sound Schema
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

// Multer Setup for File Uploads
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

// Helper for dynamic HTTPS base URL
function getBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return `${protocol}://${req.get('host')}`;
}

// ==========================================
// 📱 CLIENT APIs (For Android App)
// ==========================================

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

app.get('/api/sounds', async (req, res) => {
    try {
        const sounds = await Sound.find({}).sort({ createdAt: -1 });
        res.json({
            status: "success",
            total: sounds.length,
            sounds: sounds
        });
    } catch (err) {
        res.status(500).json({ status: false, message: "Error fetching sounds: " + err.message });
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

    res.json({ status: true, message: `Key '${key}' saved successfully!` });
});

app.post('/admin/maintenance', checkAdminAuth, async (req, res) => {
    const { status, message } = req.body;
    const config = await getConfig();

    config.settings.maintenance = status === true || status === 'true';
    if (message) config.settings.maintenanceMsg = message;

    await config.save();
    res.json({ status: true, message: `Maintenance mode updated: ${config.settings.maintenance}` });
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
    res.json({ status: true, message: "App update information updated!" });
});

app.post('/admin/ban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    const config = await getConfig();

    if (hwid && !config.bannedHWIDs.includes(hwid)) {
        config.bannedHWIDs.push(hwid);
        await config.save();
    }
    res.json({ status: true, message: `HWID '${hwid}' banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    const config = await getConfig();

    config.bannedHWIDs = config.bannedHWIDs.filter(item => item !== hwid);
    await config.save();
    res.json({ status: true, message: `HWID '${hwid}' unbanned!` });
});

app.post('/admin/reset-hwid', checkAdminAuth, async (req, res) => {
    const { key } = req.body;
    const user = await User.findOne({ key });

    if (user) {
        user.loggedDevices = [];
        await user.save();
        res.json({ status: true, message: `HWID reset for key: ${key}` });
    } else {
        res.json({ status: false, message: `Key not found!` });
    }
});

app.post('/admin/clean-expired', checkAdminAuth, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await User.deleteMany({ expiry: { $lt: today } });
    res.json({ status: true, message: `Cleaned ${result.deletedCount} expired key(s)!` });
});

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

    const host = getBaseUrl(req);
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

app.post('/api/delete-sound', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    await Sound.deleteOne({ id });
    res.json({ status: true, message: "Sound deleted successfully!" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Delete failed!" });
  }
});

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

app.get('/', (req, res) => {
    res.redirect('/admin');
});

// ==========================================
// 🎨 MATERIAL DESIGN 3 WEB ADMIN DASHBOARD
// ==========================================
app.get('/admin', (req, res) => {
    const adminKey = req.query.key || ADMIN_KEY;
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Admin Studio Dashboard</title>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
      <style>
        :root {
          --md-sys-color-background: #0B0F19;
          --md-sys-color-surface: #151C2C;
          --md-sys-color-surface-variant: #1E293B;
          --md-sys-color-primary: #6366F1;
          --md-sys-color-primary-hover: #4F46E5;
          --md-sys-color-success: #10B981;
          --md-sys-color-warning: #F59E0B;
          --md-sys-color-error: #EF4444;
          --md-sys-color-on-background: #F8FAFC;
          --md-sys-color-on-surface-sub: #94A3B8;
          --md-sys-color-border: #334155;
          --md-radius-xl: 20f;
          --md-radius-l: 12px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-tap-highlight-color: transparent; }
        body { background-color: var(--md-sys-color-background); color: var(--md-sys-color-on-background); min-height: 100vh; overflow-x: hidden; }

        /* Responsive Layout Grid */
        .layout { display: flex; flex-direction: column; min-height: 100vh; }
        @media (min-width: 769px) {
          .layout { flex-direction: row; }
        }

        /* Top Header for Mobile & Desktop */
        .sidebar {
          width: 100%;
          background-color: #030712;
          border-bottom: 1px solid var(--md-sys-color-border);
          padding: 16px;
          display: flex;
          flex-direction: column;
        }
        @media (min-width: 769px) {
          .sidebar { width: 280px; min-height: 100vh; border-bottom: none; border-right: 1px solid var(--md-sys-color-border); padding: 24px 16px; }
        }

        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .brand-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #6366F1, #4F46E5); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; }
        .brand h2 { font-size: 18px; font-weight: 700; color: white; letter-spacing: -0.3px; }

        /* Navigation Menu */
        .nav-list { display: flex; flex-wrap: wrap; gap: 8px; }
        @media (min-width: 769px) { .nav-list { flex-direction: column; } }

        .nav-item {
          flex: 1;
          min-width: 130px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          color: var(--md-sys-color-on-surface-sub);
          background-color: transparent;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        .nav-item:hover { background-color: var(--md-sys-color-surface-variant); color: white; }
        .nav-item.active { background-color: var(--md-sys-color-primary); color: white; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }

        /* Main Content Container */
        .content { flex: 1; padding: 20px; overflow-y: auto; }
        @media (min-width: 769px) { .content { padding: 36px; } }

        .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-bar h1 { font-size: 22px; font-weight: 700; color: white; display: flex; align-items: center; gap: 10px; }

        .btn-sync { background-color: var(--md-sys-color-surface-variant); color: white; border: 1px solid var(--md-sys-color-border); padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .btn-sync:hover { background-color: var(--md-sys-color-border); }

        /* Cards Layout */
        .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 1024px) { .grid { grid-template-columns: repeat(2, 1fr); } }

        .card { background-color: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
        .card-full { grid-column: 1 / -1; }
        .card-title { font-size: 16px; font-weight: 700; color: white; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }

        /* Material Inputs */
        label { display: block; font-size: 12px; font-weight: 600; color: var(--md-sys-color-on-surface-sub); margin-bottom: 6px; margin-top: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
        input, select, textarea { width: 100%; padding: 12px 16px; background-color: var(--md-sys-color-surface-variant); border: 1px solid var(--md-sys-color-border); border-radius: 10px; color: white; font-size: 14px; outline: none; transition: border-color 0.2s; }
        input:focus, select:focus { border-color: var(--md-sys-color-primary); }

        /* Custom File Input */
        input[type="file"] { padding: 8px; font-size: 12px; }

        /* Action Buttons */
        .btn { width: 100%; border: none; padding: 14px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 20px; transition: opacity 0.2s; }
        .btn:hover { opacity: 0.9; }
        .btn-primary { background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; }
        .btn-success { background: linear-gradient(135deg, #10B981, #059669); color: white; }
        .btn-warning { background: linear-gradient(135deg, #F59E0B, #D97706); color: white; }
        .btn-danger { background: linear-gradient(135deg, #EF4444, #DC2626); color: white; }

        /* Data Tables */
        .table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 12px; border: 1px solid var(--md-sys-color-border); margin-top: 12px; }
        table { width: 100%; border-collapse: collapse; background-color: var(--md-sys-color-surface-variant); text-align: left; }
        th, td { padding: 14px 16px; border-bottom: 1px solid var(--md-sys-color-border); font-size: 13px; white-space: nowrap; }
        th { background-color: #0F172A; color: var(--md-sys-color-on-surface-sub); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }

        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; display: inline-block; }
        .badge-active { background-color: rgba(16, 185, 129, 0.15); color: var(--md-sys-color-success); border: 1px solid rgba(16, 185, 129, 0.3); }

        .section { display: none; }
        .section.active { display: block; }

        /* Toast Notification */
        .toast { position: fixed; bottom: 20px; right: 20px; background-color: var(--md-sys-color-success); color: white; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: none; z-index: 9999; }
      </style>
    </head>
    <body>

    <div class="layout">
      <!-- SIDEBAR / TOPBAR -->
      <div class="sidebar">
        <div class="brand">
          <div class="brand-icon"><span class="material-icons-round">graphic_eq</span></div>
          <h2>Control Studio</h2>
        </div>
        <div class="nav-list">
          <div class="nav-item active" onclick="switchTab('sounds', this)"><span class="material-icons-round">library_music</span> Sound Library</div>
          <div class="nav-item" onclick="switchTab('keys', this)"><span class="material-icons-round">vpn_key</span> User Keys</div>
          <div class="nav-item" onclick="switchTab('settings', this)"><span class="material-icons-round">settings</span> Settings</div>
          <div class="nav-item" onclick="switchTab('bans', this)"><span class="material-icons-round">gavel</span> Ban System</div>
        </div>
      </div>

      <!-- MAIN CONTENT AREA -->
      <div class="content">
        <div class="header-bar">
          <h1 id="page-title"><span class="material-icons-round" style="color: #6366F1;">library_music</span> Sound Library</h1>
          <button class="btn-sync" onclick="loadDashboardData()"><span class="material-icons-round">sync</span> Refresh Data</button>
        </div>

        <!-- TAB 1: SOUNDS -->
        <div id="tab-sounds" class="section active">
          <div class="grid">
            <div class="card">
              <div class="card-title"><span class="material-icons-round" style="color: #10B981;">cloud_upload</span> Upload Audio Track</div>
              <form id="uploadForm" onsubmit="uploadSoundTrack(event)">
                <label>Track Title</label>
                <input type="text" id="soundTitle" placeholder="e.g., Heavy Rainfall Ambient" required />

                <label>Description</label>
                <input type="text" id="soundDesc" placeholder="e.g., Deep meditation rain audio" required />

                <label>Thumbnail Image (JPG / PNG)</label>
                <input type="file" id="soundImg" accept="image/*" required />

                <label>Audio Track (MP3)</label>
                <input type="file" id="soundAudio" accept="audio/*" required />

                <button type="submit" class="btn btn-success"><span class="material-icons-round">publish</span> Upload & Publish Track</button>
              </form>
            </div>

            <div class="card card-full">
              <div class="card-title"><span class="material-icons-round" style="color: #6366F1;">audiotrack</span> Published Tracks</div>
              <div class="table-responsive">
                <div id="soundsListContainer" style="padding: 12px; color: #94A3B8;">Loading tracks...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: KEYS -->
        <div id="tab-keys" class="section">
          <div class="grid">
            <div class="card">
              <div class="card-title"><span class="material-icons-round" style="color: #6366F1;">key_visualizer</span> Create License Key</div>
              <label>Key Name / Serial</label>
              <input type="text" id="newKeyName" placeholder="e.g., VIP-KEY-2026" />

              <label>Duration (Days)</label>
              <input type="number" id="newKeyDays" value="30" />

              <label>Device Limit</label>
              <input type="number" id="newKeyLimit" value="1" />

              <button class="btn btn-primary" onclick="createKey()"><span class="material-icons-round">add_circle</span> Save Key to Database</button>
            </div>

            <div class="card card-full">
              <div class="card-title" style="justify-content: space-between;">
                <span><span class="material-icons-round" style="color: #F59E0B;">group</span> Active User Keys</span>
                <button class="btn-sync" style="background-color: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="cleanExpiredKeys()"><span class="material-icons-round">auto_delete</span> Clean Expired Keys</button>
              </div>
              <div class="table-responsive">
                <div id="keysTableContainer" style="padding: 12px; color: #94A3B8;">Loading active keys...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: SETTINGS -->
        <div id="tab-settings" class="section">
          <div class="grid">
            <div class="card">
              <div class="card-title"><span class="material-icons-round" style="color: #F59E0B;">build</span> Maintenance Mode</div>
              <label>System Maintenance Status</label>
              <select id="maintStatus">
                <option value="false">Disable (App Fully Operational)</option>
                <option value="true">Enable (Block App Access)</option>
              </select>

              <label>Maintenance Message</label>
              <input type="text" id="maintMsg" placeholder="Server is undergoing routine maintenance!" />

              <button class="btn btn-warning" onclick="saveMaintenance()"><span class="material-icons-round">save</span> Apply Maintenance Settings</button>
            </div>

            <div class="card">
              <div class="card-title"><span class="material-icons-round" style="color: #6366F1;">system_update</span> App Version Control</div>
              <label>App Version Code</label>
              <input type="text" id="appVersion" placeholder="1.0.0" />

              <label>Download Link (APK URL)</label>
              <input type="text" id="appUrl" placeholder="https://..." />

              <button class="btn btn-primary" onclick="saveAppUpdate()"><span class="material-icons-round">cloud_download</span> Save App Update Info</button>
            </div>
          </div>
        </div>

        <!-- TAB 4: BANS -->
        <div id="tab-bans" class="section">
          <div class="card card-full">
            <div class="card-title"><span class="material-icons-round" style="color: #EF4444;">block</span> Hardware ID (HWID) Ban Control</div>
            <label>Device Hardware Serial (HWID)</label>
            <input type="text" id="banHwidInput" placeholder="Enter HWID string to block..." />
            <button class="btn btn-danger" onclick="banHwid()"><span class="material-icons-round">gavel</span> Ban Hardware ID</button>

            <h4 style="margin-top: 28px; margin-bottom: 12px; color: white;">Banned Devices List</h4>
            <div class="table-responsive">
              <div id="bannedListContainer" style="padding: 12px; color: #94A3B8;">Loading banned hardware IDs...</div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div id="toast" class="toast">Action Executed Successfully</div>

    <script>
      const ADMIN_KEY = "${adminKey}";

      function switchTab(tab, element) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        
        document.getElementById('tab-' + tab).classList.add('active');
        element.classList.add('active');

        const titleMap = {
          'sounds': '<span class="material-icons-round" style="color: #6366F1;">library_music</span> Sound Library',
          'keys': '<span class="material-icons-round" style="color: #6366F1;">vpn_key</span> User License Keys',
          'settings': '<span class="material-icons-round" style="color: #6366F1;">settings</span> System Settings',
          'bans': '<span class="material-icons-round" style="color: #EF4444;">gavel</span> HWID Ban Control'
        };
        document.getElementById('page-title').innerHTML = titleMap[tab];
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

          // Render Sounds Table
          let soundsHtml = '<table><thead><tr><th>Thumbnail</th><th>Title</th><th>Description</th><th>Action</th></tr></thead><tbody>';
          if ((data.sounds || []).length === 0) {
            soundsHtml += '<tr><td colspan="4" style="text-align: center; color: #94A3B8;">No sound tracks uploaded yet.</td></tr>';
          } else {
            (data.sounds || []).forEach(s => {
              soundsHtml += \`
                <tr>
                  <td><img src="\${s.thumbnail}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid #334155;" /></td>
                  <td><b>\${s.title}</b></td>
                  <td style="color: #94A3B8;">\${s.description}</td>
                  <td><button style="background: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-weight: 600; cursor: pointer;" onclick="deleteSound('\${s.id}')">Delete</button></td>
                </tr>
              \`;
            });
          }
          soundsHtml += '</tbody></table>';
          document.getElementById('soundsListContainer').innerHTML = soundsHtml;

          // Render Keys Table
          let keysHtml = '<table><thead><tr><th>Key</th><th>Expiry Date</th><th>Devices</th><th>Action</th></tr></thead><tbody>';
          let keysExist = false;
          for (let k in data.users) {
            keysExist = true;
            const u = data.users[k];
            keysHtml += \`
              <tr>
                <td><b>\${k}</b></td>
                <td><span class="badge badge-active">\${u.expiry}</span></td>
                <td>\${u.loggedDevices.length} / \${u.deviceLimit}</td>
                <td><button style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); padding: 8px 12px; border-radius: 8px; font-weight: 600; cursor: pointer;" onclick="resetHWID('\${k}')">Reset HWID</button></td>
              </tr>
            \`;
          }
          if (!keysExist) {
            keysHtml += '<tr><td colspan="4" style="text-align: center; color: #94A3B8;">No license keys created yet.</td></tr>';
          }
          keysHtml += '</tbody></table>';
          document.getElementById('keysTableContainer').innerHTML = keysHtml;

          // Render Banned Table
          let bansHtml = '<table><thead><tr><th>Hardware ID (HWID)</th><th>Action</th></tr></thead><tbody>';
          if ((data.bannedHWIDs || []).length === 0) {
            bansHtml += '<tr><td colspan="2" style="text-align: center; color: #94A3B8;">No banned hardware IDs found.</td></tr>';
          } else {
            (data.bannedHWIDs || []).forEach(h => {
              bansHtml += \`
                <tr>
                  <td><b>\${h}</b></td>
                  <td><button style="background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 12px; border-radius: 8px; font-weight: 600; cursor: pointer;" onclick="unbanHWID('\${h}')">Unban HWID</button></td>
                </tr>
              \`;
            });
          }
          bansHtml += '</tbody></table>';
          document.getElementById('bannedListContainer').innerHTML = bansHtml;

        } catch (e) {
          showToast('Failed to connect to cloud server!');
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
        if (!confirm('Delete this track permanently?')) return;
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

      async function banHwid() {
        const hwid = document.getElementById('banHwidInput').value;
        if (!hwid) return;
        const res = await fetch('/admin/ban-hwid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ hwid })
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function unbanHWID(hwid) {
        const res = await fetch('/admin/unban-hwid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ hwid })
        });
        const json = await res.json();
        showToast(json.message);
        loadDashboardData();
      }

      async function saveMaintenance() {
        const status = document.getElementById('maintStatus').value;
        const message = document.getElementById('maintMsg').value;
        const res = await fetch('/admin/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ status, message })
        });
        const json = await res.json();
        showToast(json.message);
      }

      async function saveAppUpdate() {
        const version = document.getElementById('appVersion').value;
        const downloadUrl = document.getElementById('appUrl').value;
        const res = await fetch('/admin/update-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ version, downloadUrl })
        });
        const json = await res.json();
        showToast(json.message);
      }

      loadDashboardData();
    </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
