const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";

// 📢 Global Notice (সব ক্লায়েন্টদের জন্য নোটিশ)
let globalAnnouncement = {
    notice: "Server Online! Welcome to Emon Auth System.",
    updatedAt: new Date().toLocaleString()
};

// 🔑 Database Simulation
const usersDatabase = {
    "VIP-EMON-2026": {
        expiry: "2026-12-31",
        deviceLimit: 2,
        isBanned: false,
        banReason: "",
        loggedDevices: []
    }
};

// Helper: Calculate Date Offset
function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// ==========================================
// 🎮 1. Android/C++ Client Login Endpoint
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

    const user = usersDatabase[userKey];
    if (!user) return res.json({ status: false, reason: "Invalid User Key!" });

    if (user.isBanned) {
        return res.json({ status: false, reason: `BANNED: ${user.banReason || 'Contact Admin'}` });
    }

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

    return res.json({
        status: true,
        data: { 
            token: generatedToken, 
            expiry: user.expiry,
            announcement: globalAnnouncement.notice 
        },
        reason: "Login Success"
    });
});

// ==========================================
// 👑 2. Admin Control APIs (Unlimited Features)
// ==========================================

// 🚀 Create Key (Supports Exact Expiry OR Preset Days like 1, 7, 30)
app.post('/admin/create-key', (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (!key) return res.json({ status: false, message: "Key Name is required!" });

    // If preset days provided (e.g. 1, 7, 30)
    if (days) {
        expiry = addDays(days);
    }

    if (!expiry) return res.json({ status: false, message: "Expiry Date or Days Preset required!" });

    usersDatabase[key] = {
        expiry: expiry,
        deviceLimit: parseInt(limit) || 1,
        isBanned: false,
        banReason: "",
        loggedDevices: []
    };
    return res.json({ status: true, message: `Key '${key}' Created (Expires: ${expiry})` });
});

// 🔒 Ban / Unban Key
app.post('/admin/toggle-ban', (req, res) => {
    const { key, ban, reason } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].isBanned = ban;
        usersDatabase[key].banReason = reason || "";
        return res.json({ status: true, message: `Key '${key}' ${ban ? 'Banned' : 'Unbanned'}!` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

// 🔄 Reset HWID / Clear Devices
app.post('/admin/reset-hwid', (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].loggedDevices = [];
        return res.json({ status: true, message: `HWID Reset successful for key: ${key}` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

// 🗑️ Delete Specific Key
app.post('/admin/delete-key', (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        delete usersDatabase[key];
        return res.json({ status: true, message: `Key '${key}' Deleted!` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

// 🧹 Clean All Expired Keys in 1-Click
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

// 📢 Update Global Announcement/Notice
app.post('/admin/set-announcement', (req, res) => {
    const { notice } = req.body;
    if (!notice) return res.json({ status: false, message: "Notice message is required!" });

    globalAnnouncement = {
        notice: notice,
        updatedAt: new Date().toLocaleString()
    };
    return res.json({ status: true, message: "Notice Updated Successfully!" });
});

// 📊 Get All Data (Users + Notice)
app.get('/admin/api/users', (req, res) => {
    res.json({
        announcement: globalAnnouncement,
        users: usersDatabase
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Emon Auth Server running on port ${PORT}`));
