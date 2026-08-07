const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = "EmonAdmin2026SecretKey"; 
const DB_FILE = path.join(__dirname, 'database.json');

// 📁 Safe JSON File Persistence System
function loadDB() {
    const initialDB = {
        users: {},
        bannedHWIDs: [],
        settings: {
            maintenance: false,
            maintenanceMsg: "Login disabled by Admin!"
        },
        announcement: {
            title: "NOTICE",
            notice: "Welcome to App System!",
            style: "Information",
            isCancelable: true
        },
        update: {
            version: "1.0.0",
            downloadUrl: "https://example.com/app.apk",
            forceUpdate: false
        }
    };

    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
            return initialDB;
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        if (!data.trim()) return initialDB; // ফাইল খালি থাকলে ডিফল্ট লোড করবে
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading database.json, keeping existing safely:", e);
        // ভুল করে ফাঁকা ওভাররাইট হওয়া রোধ করতে ব্যাকআপ ফাইল বা গ্লোবাল অবজেক্ট ব্যবহার করা শ্রেয়
        return initialDB;
    }
}

function saveDB(db) {
    try {
        // ফাঁকা ডাটা ওভাররাইট হওয়া রোধ
        if (!db || !db.users) return;
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("Error writing database.json:", e);
    }
}

function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

const checkAdminAuth = (req, res, next) => {
    if (req.headers['x-admin-key'] !== ADMIN_KEY) {
        return res.status(403).json({ status: false, message: "Unauthorized Admin!" });
    }
    next();
};

// 🎮 CLIENT LOGIN API
app.post('/connect/b2k', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key!" });
    }

    const db = loadDB();

    if (db.settings.maintenance) {
        return res.json({
            status: false,
            toast: db.settings.maintenanceMsg || "Maintenance Mode Enabled!",
            reason: db.settings.maintenanceMsg || "Maintenance Mode Enabled!"
        });
    }

    const { game, user_key: userKey, serial, device_name, android_version } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!userKey || !serial) {
        return res.json({ status: false, reason: "Key or HWID Missing!" });
    }

    if (db.bannedHWIDs.includes(serial)) {
        return res.json({ status: false, reason: "DEVICE BANNED!" });
    }

    const user = db.users[userKey];
    if (!user) {
        return res.json({ status: false, reason: "Invalid Key!" });
    }

    const today = new Date().toISOString().split('T')[0];
    if (today > user.expiry) {
        return res.json({ status: false, reason: "Key Expired!" });
    }

    if (!user.loggedDevices) {
        user.loggedDevices = [];
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
        saveDB(db);
    }

    const rawString = `${game || 'PUBG'}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    return res.json({
        status: true,
        data: { token: generatedToken, expiry: user.expiry },
        reason: "Login Success"
    });
});

// 👑 ADMIN APIs
app.post('/admin/create-key', checkAdminAuth, (req, res) => {
    let { key, expiry, days, limit } = req.body;
    
    if (!key) {
        return res.status(400).json({ status: false, message: "Key name is required!" });
    }

    const db = loadDB();

    if (days) expiry = addDays(days);
    const targetExpiry = expiry || addDays(1);
    const targetLimit = parseInt(limit) || 1;

    if (!db.users[key]) {
        db.users[key] = {
            expiry: targetExpiry,
            deviceLimit: targetLimit,
            loggedDevices: []
        };
    } else {
        db.users[key].expiry = targetExpiry;
        db.users[key].deviceLimit = targetLimit;
    }

    saveDB(db);
    res.json({ status: true, message: `Key '${key}' Created Successfully!` });
});

app.post('/admin/maintenance', checkAdminAuth, (req, res) => {
    const { status, message } = req.body;
    const db = loadDB();

    db.settings.maintenance = status === true || status === 'true';
    if (message) db.settings.maintenanceMsg = message;

    saveDB(db);
    res.json({ status: true, message: `Maintenance mode set to: ${db.settings.maintenance}` });
});

app.post('/admin/update-app', checkAdminAuth, (req, res) => {
    const { version, downloadUrl, forceUpdate } = req.body;
    const db = loadDB();

    db.update = {
        version: version || db.update.version,
        downloadUrl: downloadUrl || db.update.downloadUrl,
        forceUpdate: forceUpdate === true || forceUpdate === 'true'
    };

    saveDB(db);
    res.json({ status: true, message: "App Update Saved!" });
});

app.post('/admin/ban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    const db = loadDB();

    if (hwid && !db.bannedHWIDs.includes(hwid)) {
        db.bannedHWIDs.push(hwid);
        saveDB(db);
    }
    res.json({ status: true, message: `HWID '${hwid}' Banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    const db = loadDB();

    db.bannedHWIDs = db.bannedHWIDs.filter(item => item !== hwid);
    saveDB(db);
    res.json({ status: true, message: `HWID '${hwid}' Unbanned!` });
});

app.post('/admin/reset-hwid', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    const db = loadDB();

    if (db.users[key]) {
        db.users[key].loggedDevices = [];
        saveDB(db);
        res.json({ status: true, message: `HWID Reset for key: ${key}` });
    } else {
        res.json({ status: false, message: `Key not found!` });
    }
});

app.post('/admin/clean-expired', checkAdminAuth, (req, res) => {
    const db = loadDB();
    const today = new Date().toISOString().split('T')[0];
    let deletedCount = 0;

    Object.keys(db.users).forEach(key => {
        if (db.users[key].expiry < today) {
            delete db.users[key];
            deletedCount++;
        }
    });

    saveDB(db);
    res.json({ status: true, message: `Cleaned ${deletedCount} Expired Keys!` });
});

app.post('/admin/set-announcement', checkAdminAuth, (req, res) => {
    const { title, notice, isCancelable } = req.body;
    const db = loadDB();

    db.announcement = {
        title: title || "NOTICE",
        notice: notice || "",
        style: "Information",
        isCancelable: isCancelable === true || isCancelable === 'true'
    };

    saveDB(db);
    res.json({ status: true, message: "Notice Updated!" });
});

app.get('/admin/api/users', checkAdminAuth, (req, res) => {
    const db = loadDB();
    res.json({
        settings: db.settings,
        announcement: db.announcement,
        update: db.update,
        bannedHWIDs: db.bannedHWIDs,
        users: db.users
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
