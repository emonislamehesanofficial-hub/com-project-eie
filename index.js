const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Security & API Keys
const SECRET_SALT = process.env.SECRET_SALT || "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = process.env.API_KEY || "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = process.env.ADMIN_KEY || "EmonAdmin2026SecretKey"; 

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Database Connected Successfully!"))
    .catch(err => console.error("MongoDB Connection Error:", err));

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

const User = mongoose.model('User', userSchema);
const Config = mongoose.model('Config', configSchema);

// Helper to load settings
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
    if (req.headers['x-admin-key'] !== ADMIN_KEY) {
        return res.status(403).json({ status: false, message: "Unauthorized Admin!" });
    }
    next();
};

// CLIENT LOGIN API
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

// ADMIN APIs
app.post('/admin/create-key', checkAdminAuth, async (req, res) => {
    let { key, expiry, days, limit } = req.body;
    
    if (!key) {
        return res.status(400).json({ status: false, message: "Key name is required!" });
    }

    if (days) expiry = addDays(days);
    const targetExpiry = expiry || addDays(1);
    const targetLimit = parseInt(limit) || 1;

    await User.findOneAndUpdate(
        { key: key },
        { expiry: targetExpiry, deviceLimit: targetLimit },
        { upsert: true, new: true }
    );

    res.json({ status: true, message: `Key '${key}' Created & Saved Permanently!` });
});

app.post('/admin/maintenance', checkAdminAuth, async (req, res) => {
    const { status, message } = req.body;
    const config = await getConfig();

    config.settings.maintenance = status === true || status === 'true';
    if (message) config.settings.maintenanceMsg = message;

    await config.save();
    res.json({ status: true, message: `Maintenance mode set to: ${config.settings.maintenance}` });
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

app.get('/admin/api/users', checkAdminAuth, async (req, res) => {
    const config = await getConfig();
    const usersList = await User.find({});
    
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
        users: usersMap
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
