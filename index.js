const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = "EmonAdmin2026SecretKey"; 

let systemSettings = {
    maintenance: false,
    maintenanceMsg: "Login disabled by Admin!"
};

let globalAnnouncement = {
    title: "NOTICE",
    notice: "Welcome to App System!",
    style: "Information",
    isCancelable: true
};

let appUpdateConfig = {
    version: "1.0.0",
    downloadUrl: "https://example.com/app.apk",
    forceUpdate: false
};

const bannedDevices = new Set();
const usersDatabase = {};

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

    // 🛑 Login OFF Toast Check
    if (systemSettings.maintenance) {
        return res.json({
            status: false,
            toast: systemSettings.maintenanceMsg,
            reason: systemSettings.maintenanceMsg
        });
    }

    const { game, user_key: userKey, serial, device_name, android_version } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!userKey || !serial) {
        return res.json({ status: false, reason: "Key or HWID Missing!" });
    }

    if (bannedDevices.has(serial)) {
        return res.json({ status: false, reason: "DEVICE BANNED!" });
    }

    const user = usersDatabase[userKey];
    if (!user) {
        return res.json({ status: false, reason: "Invalid Key!" });
    }

    const today = new Date().toISOString().split('T')[0];
    if (today > user.expiry) {
        return res.json({ status: false, reason: "Key Expired!" });
    }

    let existingDevice = user.loggedDevices.find(dev => dev.hwid === serial);
    if (!existingDevice) {
        if (user.loggedDevices.length >= user.deviceLimit) {
            return res.json({ status: false, reason: "Device Limit Exceeded!" });
        }
        user.loggedDevices.push({
            hwid: serial,
            name: device_name || "Unknown Device",
            androidVer: android_version || "OS",
            ip: clientIp,
            lastLogin: new Date().toLocaleString()
        });
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
app.post('/admin/maintenance', checkAdminAuth, (req, res) => {
    const { status, message } = req.body;
    systemSettings.maintenance = status === true || status === 'true';
    if (message) systemSettings.maintenanceMsg = message;
    res.json({ status: true, message: `Login OFF: ${systemSettings.maintenance}` });
});

app.post('/admin/update-app', checkAdminAuth, (req, res) => {
    const { version, downloadUrl, forceUpdate } = req.body;
    appUpdateConfig = { version, downloadUrl, forceUpdate };
    res.json({ status: true, message: "App Update Saved!" });
});

app.post('/admin/ban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    bannedDevices.add(hwid);
    res.json({ status: true, message: `HWID '${hwid}' Banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    bannedDevices.delete(hwid);
    res.json({ status: true, message: `HWID '${hwid}' Unbanned!` });
});

app.post('/admin/create-key', checkAdminAuth, (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (days) expiry = addDays(days);

    usersDatabase[key] = {
        expiry: expiry || addDays(1),
        deviceLimit: parseInt(limit) || 1,
        loggedDevices: []
    };
    res.json({ status: true, message: `Key '${key}' Created!` });
});

app.post('/admin/reset-hwid', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) usersDatabase[key].loggedDevices = [];
    res.json({ status: true, message: `HWID Reset for key: ${key}` });
});

app.post('/admin/clean-expired', checkAdminAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    let deletedCount = 0;
    for (let key in usersDatabase) {
        if (usersDatabase[key].expiry < today) {
            delete usersDatabase[key];
            deletedCount++;
        }
    }
    res.json({ status: true, message: `Cleaned ${deletedCount} Expired Keys!` });
});

app.post('/admin/set-announcement', checkAdminAuth, (req, res) => {
    const { title, notice, isCancelable } = req.body;
    globalAnnouncement = { title, notice, isCancelable };
    res.json({ status: true, message: "Notice Updated!" });
});

app.get('/admin/api/users', checkAdminAuth, (req, res) => {
    res.json({
        settings: systemSettings,
        announcement: globalAnnouncement,
        update: appUpdateConfig,
        bannedHWIDs: Array.from(bannedDevices),
        users: usersDatabase
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
