const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";

// 📢 Advanced Remote Notice Storage
let globalAnnouncement = {
    title: "SYSTEM UPDATE",
    notice: "Welcome to Premium Auth System!",
    style: "Information", // Options: Information, Warning, Critical
    isCancelable: true,   // true = User can close, false = Mandatory force popup
    updatedAt: new Date().toLocaleString()
};

// 🚫 Banned HWID List Storage
const bannedDevices = new Set();

// 🔑 Database Simulation
const usersDatabase = {
    "VIP-EMON-2026": {
        expiry: "2026-12-31",
        deviceLimit: 2,
        loggedDevices: []
    }
};

function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// ==========================================
// 🎮 1. Client Login Endpoint
// ==========================================
app.post('/connect/b2k', (req, res) => {
    const clientApiKey = req.headers['x-api-key'];
    if (clientApiKey !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key" });
    }

    const { game, user_key: userKey, serial, device_name, android_version } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!userKey || !serial) {
        return res.json({ status: false, reason: "Key or HWID Missing!" });
    }

    // Check Banned Devices
    if (bannedDevices.has(serial)) {
        return res.json({ status: false, reason: "THIS DEVICE HAS BEEN PERMANENTLY BANNED!" });
    }

    const user = usersDatabase[userKey];
    if (!user) return res.json({ status: false, reason: "Invalid User Key!" });

    const today = new Date().toISOString().split('T')[0];
    if (today > user.expiry) {
        return res.json({ status: false, reason: "Your Key Has Expired!" });
    }

    let existingDevice = user.loggedDevices.find(dev => dev.hwid === serial);

    if (!existingDevice) {
        if (user.loggedDevices.length >= user.deviceLimit) {
            return res.json({ status: false, reason: `Device Limit Exceeded! Max ${user.deviceLimit} Device(s).` });
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

    const rawString = `${game}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    // Responds with Token AND Full Remote Announcement Object
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
// 👑 2. Admin Control APIs
// ==========================================

// Create Key
app.post('/admin/create-key', (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (!key) return res.json({ status: false, message: "Key Name is required!" });

    if (days) expiry = addDays(days);
    if (!expiry) return res.json({ status: false, message: "Select Expiry Date!" });

    usersDatabase[key] = {
        expiry: expiry,
        deviceLimit: parseInt(limit) || 1,
        loggedDevices: []
    };
    return res.json({ status: true, message: `Key '${key}' Created (Expires: ${expiry})` });
});

// Ban Device HWID
app.post('/admin/ban-hwid', (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.json({ status: false, message: "HWID is required!" });

    bannedDevices.add(hwid);
    return res.json({ status: true, message: `Device HWID '${hwid}' Banned Successfully!` });
});

// HWID Reset
app.post('/admin/reset-hwid', (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].loggedDevices = [];
        return res.json({ status: true, message: `HWID Reset successful for key: ${key}` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

// Clean Expired Keys
app.post('/admin/clean-expired', (req, res) => {
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

// 📢 Broadcast Advanced Remote Notice
app.post('/admin/set-announcement', (req, res) => {
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

// 📊 Server Data API
app.get('/admin/api/users', (req, res) => {
    res.json({
        announcement: globalAnnouncement,
        bannedHWIDs: Array.from(bannedDevices),
        users: usersDatabase
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Emon Premium Auth Server running on port ${PORT}`));
