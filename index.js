const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔐 Config Constants
const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = "EmonAdmin2026SecretKey"; 

// 🛠️ Server Settings (Login ON/OFF Control)
let systemSettings = {
    maintenance: false, // true = LOGIN OFF, false = LOGIN ON
    maintenanceMsg: "Login is currently disabled by Admin!"
};

let globalAnnouncement = {
    title: "SYSTEM NOTICE",
    notice: "Welcome to Premium Auth System!",
    style: "Information",
    isCancelable: true,
    updatedAt: new Date().toLocaleString()
};

const bannedDevices = new Set();

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

const checkAdminAuth = (req, res, next) => {
    const adminPass = req.headers['x-admin-key'] || req.body.admin_key;
    if (adminPass !== ADMIN_KEY) {
        return res.status(403).json({ status: false, message: "Unauthorized Admin Access!" });
    }
    next();
};

// ==========================================
// 🎮 1. CLIENT API (App Login Endpoint)
// ==========================================
app.post('/connect/b2k', (req, res) => {
    const clientApiKey = req.headers['x-api-key'];
    if (clientApiKey !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key Access!" });
    }

    const { game, user_key: userKey, serial, device_name, android_version } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 🛑 LOGIN OFF SYSTEM (Valid key দিয়ে ঢুকলেও ঢুকবে না, Toast দেখাবে)
    if (systemSettings.maintenance) {
        return res.json({
            status: false,
            reason: systemSettings.maintenanceMsg, // সার্ভারে সেট করা Toast Message
            toast: systemSettings.maintenanceMsg
        });
    }

    if (!userKey || !serial) {
        return res.json({ status: false, reason: "User Key or HWID Missing!" });
    }

    if (bannedDevices.has(serial)) {
        return res.json({ 
            status: false, 
            reason: "THIS DEVICE HAS BEEN PERMANENTLY BANNED!"
        });
    }

    const user = usersDatabase[userKey];
    if (!user) {
        return res.json({ 
            status: false, 
            reason: "Invalid User Key!"
        });
    }

    const today = new Date().toISOString().split('T')[0];
    if (today > user.expiry) {
        return res.json({ 
            status: false, 
            reason: "Your Key Has Expired!"
        });
    }

    let existingDevice = user.loggedDevices.find(dev => dev.hwid === serial);

    if (!existingDevice) {
        if (user.loggedDevices.length >= user.deviceLimit) {
            return res.json({ 
                status: false, 
                reason: `Device Limit Exceeded! Max Allowed: ${user.deviceLimit}`
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

    const rawString = `${game || 'PUBG'}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    return res.json({
        status: true,
        data: { 
            token: generatedToken, 
            expiry: user.expiry 
        },
        reason: "Login Success"
    });
});

// ==========================================
// 👑 2. ADMIN CONTROL APIs
// ==========================================

// 🛠️ LOGIN ON/OFF Toggle API
app.post('/admin/maintenance', checkAdminAuth, (req, res) => {
    const { status, message } = req.body;
    systemSettings.maintenance = status === true || status === 'true';
    if (message) systemSettings.maintenanceMsg = message;

    return res.json({ 
        status: true, 
        message: `Login System is now ${systemSettings.maintenance ? 'OFF (Disabled)' : 'ON (Active)'}` 
    });
});

app.post('/admin/ban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.json({ status: false, message: "HWID is required!" });

    bannedDevices.add(hwid);
    return res.json({ status: true, message: `HWID '${hwid}' Banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.json({ status: false, message: "HWID is required!" });

    if (bannedDevices.has(hwid)) {
        bannedDevices.delete(hwid);
        return res.json({ status: true, message: `HWID '${hwid}' Unbanned!` });
    }
    return res.json({ status: false, message: "HWID not in Banned List!" });
});

app.post('/admin/create-key', checkAdminAuth, (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (!key) return res.json({ status: false, message: "Key Name required!" });

    if (days) expiry = addDays(days);
    if (!expiry) return res.json({ status: false, message: "Select Expiry Date!" });

    usersDatabase[key] = {
        expiry: expiry,
        deviceLimit: parseInt(limit) || 1,
        loggedDevices: []
    };
    return res.json({ status: true, message: `Key '${key}' Saved (Expiry: ${expiry})` });
});

app.post('/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        delete usersDatabase[key];
        return res.json({ status: true, message: `Key '${key}' deleted!` });
    }
    return res.json({ status: false, message: "Key not found!" });
});

app.post('/admin/reset-hwid', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].loggedDevices = [];
        return res.json({ status: true, message: `HWID Reset for key: ${key}` });
    }
    return res.json({ status: false, message: "Key not found!" });
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
    return res.json({ status: true, message: `Cleaned ${deletedCount} Expired Keys!` });
});

app.post('/admin/set-announcement', checkAdminAuth, (req, res) => {
    const { title, notice, style, isCancelable } = req.body;
    if (!notice) return res.json({ status: false, message: "Notice body required!" });

    globalAnnouncement = {
        title: title || "NOTICE",
        notice: notice,
        style: style || "Information",
        isCancelable: isCancelable !== undefined ? isCancelable : true,
        updatedAt: new Date().toLocaleString()
    };
    return res.json({ status: true, message: "Notice Broadcasted!" });
});

app.get('/admin/api/users', checkAdminAuth, (req, res) => {
    res.json({
        settings: systemSettings,
        announcement: globalAnnouncement,
        bannedHWIDs: Array.from(bannedDevices),
        totalUsers: Object.keys(usersDatabase).length,
        users: usersDatabase
    });
});

app.get('/', (req, res) => {
    res.send("🚀 Emon Auth Server Active!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Emon Auth Server Active on Port: ${PORT}`);
});
