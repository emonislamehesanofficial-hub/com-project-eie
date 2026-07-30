const express = require('express');
const crypto = require('crypto');
const app = express();

// Parsing Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔐 Config Constants
const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = "EmonAdmin2026SecretKey"; // অ্যাডমিন এপিআই সুরক্ষিত রাখার জন্য

// 🛠️ Server Settings (Maintenance Mode System)
let systemSettings = {
    maintenance: false, // true করলে সার্ভার ডাউন মেসেজ দেখাবে
    maintenanceMsg: "Server is under maintenance. Please try again later!"
};

// 📢 Remote Notice Dynamic Storage
let globalAnnouncement = {
    title: "SYSTEM NOTICE",
    notice: "Welcome to Premium Auth System!",
    style: "Information",
    isCancelable: true,
    updatedAt: new Date().toLocaleString()
};

// 🚫 Permanent Banned HWIDs Storage Set
const bannedDevices = new Set();

// 🔑 Database Memory Storage
const usersDatabase = {
    "VIP-EMON-2026": {
        expiry: "2026-12-31",
        deviceLimit: 2,
        loggedDevices: []
    }
};

// Helper: Add Days to Current Date
function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// Admin Security Middleware Check
const checkAdminAuth = (req, res, next) => {
    const adminPass = req.headers['x-admin-key'] || req.body.admin_key;
    if (adminPass !== ADMIN_KEY) {
        return res.status(403).json({ status: false, message: "Unauthorized Admin Access!" });
    }
    next();
};

// ==========================================
// 🎮 1. CLIENT API (App / C++ Login Endpoint)
// ==========================================
app.post('/connect/b2k', (req, res) => {
    // API Key Verification
    const clientApiKey = req.headers['x-api-key'];
    if (clientApiKey !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key Access!" });
    }

    const { game, user_key: userKey, serial, device_name, android_version } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Check System Maintenance Mode
    if (systemSettings.maintenance) {
        return res.json({
            status: false,
            reason: systemSettings.maintenanceMsg,
            data: { announcement: globalAnnouncement }
        });
    }

    // Check Payload Missing
    if (!userKey || !serial) {
        return res.json({ status: false, reason: "User Key or HWID Missing!" });
    }

    // Check Device Banned Status
    if (bannedDevices.has(serial)) {
        return res.json({ 
            status: false, 
            reason: "THIS DEVICE HAS BEEN PERMANENTLY BANNED!",
            data: { announcement: globalAnnouncement }
        });
    }

    // Check Key Existence
    const user = usersDatabase[userKey];
    if (!user) {
        return res.json({ 
            status: false, 
            reason: "Invalid User Key!",
            data: { announcement: globalAnnouncement }
        });
    }

    // Check Expiry
    const today = new Date().toISOString().split('T')[0];
    if (today > user.expiry) {
        return res.json({ 
            status: false, 
            reason: "Your Key Has Expired!",
            data: { announcement: globalAnnouncement }
        });
    }

    // Multi-Device & HWID Tracking Logic
    let existingDevice = user.loggedDevices.find(dev => dev.hwid === serial);

    if (!existingDevice) {
        if (user.loggedDevices.length >= user.deviceLimit) {
            return res.json({ 
                status: false, 
                reason: `Device Limit Exceeded! Maximum Allowed: ${user.deviceLimit}`,
                data: { announcement: globalAnnouncement }
            });
        }

        existingDevice = {
            hwid: serial,
            name: device_name || "Unknown Device",
            androidVer: android_version || "Unknown OS",
            ip: clientIp,
            lastLogin: new Date().toLocaleString()
        };
        user.loggedDevices.push(existingDevice);
    } else {
        existingDevice.lastLogin = new Date().toLocaleString();
        existingDevice.ip = clientIp;
        if (device_name) existingDevice.name = device_name;
    }

    // Token Generation (MD5 Security Verification)
    const rawString = `${game || 'PUBG'}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    return res.json({
        status: true,
        data: { 
            token: generatedToken, 
            expiry: user.expiry,
            announcement: globalAnnouncement 
        },
        reason: "Login Success"
    });
});

// ==========================================
// 👑 2. ADMIN CONTROL APIs (Android Controller)
// ==========================================

// 🛠️ Maintenance Toggle
app.post('/admin/maintenance', checkAdminAuth, (req, res) => {
    const { status, message } = req.body;
    systemSettings.maintenance = status === true || status === 'true';
    if (message) systemSettings.maintenanceMsg = message;

    return res.json({ 
        status: true, 
        message: `Maintenance Mode is now ${systemSettings.maintenance ? 'ENABLED' : 'DISABLED'}` 
    });
});

// 🚫 Ban Device HWID
app.post('/admin/ban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.json({ status: false, message: "HWID is required!" });

    bannedDevices.add(hwid);
    return res.json({ status: true, message: `Device HWID '${hwid}' Banned Successfully!` });
});

// 🔓 Unban Device HWID
app.post('/admin/unban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.json({ status: false, message: "HWID is required!" });

    if (bannedDevices.has(hwid)) {
        bannedDevices.delete(hwid);
        return res.json({ status: true, message: `Device HWID '${hwid}' Unbanned Successfully!` });
    }
    return res.json({ status: false, message: "HWID is not in Banned List!" });
});

// 🔑 Create / Extend User Key
app.post('/admin/create-key', checkAdminAuth, (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (!key) return res.json({ status: false, message: "Key Name is required!" });

    if (days) expiry = addDays(days);
    if (!expiry) return res.json({ status: false, message: "Select Expiry Date!" });

    usersDatabase[key] = {
        expiry: expiry,
        deviceLimit: parseInt(limit) || 1,
        loggedDevices: []
    };
    return res.json({ status: true, message: `Key '${key}' Created/Updated (Expiry: ${expiry})` });
});

// ❌ Delete User Key
app.post('/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        delete usersDatabase[key];
        return res.json({ status: true, message: `Key '${key}' deleted successfully!` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

// 🔄 Reset Logged Devices (HWID Reset)
app.post('/admin/reset-hwid', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].loggedDevices = [];
        return res.json({ status: true, message: `HWID Reset successful for key: ${key}` });
    }
    return res.json({ status: false, message: "Key not found in database!" });
});

// 🧹 Clean Expired Keys
app.post('/admin/clean-expired', checkAdminAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    let deletedCount = 0;

    for (let key in usersDatabase) {
        if (usersDatabase[key].expiry < today) {
            delete usersDatabase[key];
            deletedCount++;
        }
    }
    return res.json({ status: true, message: `Cleaned ${deletedCount} Expired Key(s)!` });
});

// 📢 Broadcast Remote Dialog Notice
app.post('/admin/set-announcement', checkAdminAuth, (req, res) => {
    const { title, notice, style, isCancelable } = req.body;
    if (!notice) return res.json({ status: false, message: "Notice message is required!" });

    globalAnnouncement = {
        title: title || "NOTICE",
        notice: notice,
        style: style || "Information",
        isCancelable: isCancelable !== undefined ? isCancelable : true,
        updatedAt: new Date().toLocaleString()
    };
    return res.json({ status: true, message: "Remote Notice Broadcasted Successfully!" });
});

// 📊 Admin Dashboard Data API
app.get('/admin/api/users', checkAdminAuth, (req, res) => {
    res.json({
        settings: systemSettings,
        announcement: globalAnnouncement,
        bannedHWIDs: Array.from(bannedDevices),
        totalUsers: Object.keys(usersDatabase).length,
        users: usersDatabase
    });
});

// Default Health Route
app.get('/', (req, res) => {
    res.send("🚀 Emon Auth Server is Running Live!");
});

// Server Initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Emon Auth Server Active`);
    console.log(`📡 Listening on Port: ${PORT}`);
    console.log(`=================================`);
});
