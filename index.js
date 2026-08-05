const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";
const ADMIN_KEY = "EmonAdmin2026SecretKey"; 

// 🔗 MongoDB Connection String
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://project-eie:05022006freefire@cluster0.1wzt6ox.mongodb.net/app_db?retryWrites=true&w=majority";

// 🌐 MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 📜 Database Schemas & Models
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

const bannedSchema = new mongoose.Schema({
    hwid: { type: String, required: true, unique: true }
});

const configSchema = new mongoose.Schema({
    type: { type: String, required: true, unique: true },
    data: mongoose.Schema.Types.Mixed
});

const User = mongoose.model('User', userSchema);
const BannedDevice = mongoose.model('BannedDevice', bannedSchema);
const Config = mongoose.model('Config', configSchema);

// Helper functions for persistent configurations
async function getConfig(type, defaultValue) {
    const found = await Config.findOne({ type });
    return found ? found.data : defaultValue;
}

async function setConfig(type, value) {
    await Config.updateOne({ type }, { data: value }, { upsert: true });
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
app.post('/connect/b2k', async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key!" });
    }

    const systemSettings = await getConfig('systemSettings', {
        maintenance: false,
        maintenanceMsg: "Login disabled by Admin!"
    });

    // 🛑 Login OFF Check
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

    // HWID Ban Check
    const isBanned = await BannedDevice.findOne({ hwid: serial });
    if (isBanned) {
        return res.json({ status: false, reason: "DEVICE BANNED!" });
    }

    // User Key Check
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
        await user.save();
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
app.post('/admin/maintenance', checkAdminAuth, async (req, res) => {
    const { status, message } = req.body;
    const systemSettings = await getConfig('systemSettings', {
        maintenance: false,
        maintenanceMsg: "Login disabled by Admin!"
    });

    systemSettings.maintenance = status === true || status === 'true';
    if (message) systemSettings.maintenanceMsg = message;

    await setConfig('systemSettings', systemSettings);
    res.json({ status: true, message: `Login OFF: ${systemSettings.maintenance}` });
});

app.post('/admin/update-app', checkAdminAuth, async (req, res) => {
    const { version, downloadUrl, forceUpdate } = req.body;
    const appUpdateConfig = { version, downloadUrl, forceUpdate };

    await setConfig('appUpdateConfig', appUpdateConfig);
    res.json({ status: true, message: "App Update Saved!" });
});

app.post('/admin/ban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    await BannedDevice.updateOne({ hwid }, { hwid }, { upsert: true });
    res.json({ status: true, message: `HWID '${hwid}' Banned!` });
});

app.post('/admin/unban-hwid', checkAdminAuth, async (req, res) => {
    const { hwid } = req.body;
    await BannedDevice.deleteOne({ hwid });
    res.json({ status: true, message: `HWID '${hwid}' Unbanned!` });
});

app.post('/admin/create-key', checkAdminAuth, async (req, res) => {
    let { key, expiry, days, limit } = req.body;
    if (days) expiry = addDays(days);

    const targetExpiry = expiry || addDays(1);
    const targetLimit = parseInt(limit) || 1;

    await User.updateOne(
        { key },
        { expiry: targetExpiry, deviceLimit: targetLimit },
        { upsert: true }
    );
    res.json({ status: true, message: `Key '${key}' Created!` });
});

app.post('/admin/reset-hwid', checkAdminAuth, async (req, res) => {
    const { key } = req.body;
    await User.updateOne({ key }, { loggedDevices: [] });
    res.json({ status: true, message: `HWID Reset for key: ${key}` });
});

app.post('/admin/clean-expired', checkAdminAuth, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await User.deleteMany({ expiry: { $lt: today } });
    res.json({ status: true, message: `Cleaned ${result.deletedCount} Expired Keys!` });
});

app.post('/admin/set-announcement', checkAdminAuth, async (req, res) => {
    const { title, notice, isCancelable } = req.body;
    const globalAnnouncement = { title, notice, isCancelable };

    await setConfig('globalAnnouncement', globalAnnouncement);
    res.json({ status: true, message: "Notice Updated!" });
});

app.get('/admin/api/users', checkAdminAuth, async (req, res) => {
    const systemSettings = await getConfig('systemSettings', {
        maintenance: false,
        maintenanceMsg: "Login disabled by Admin!"
    });
    const globalAnnouncement = await getConfig('globalAnnouncement', {
        title: "NOTICE",
        notice: "Welcome to App System!",
        style: "Information",
        isCancelable: true
    });
    const appUpdateConfig = await getConfig('appUpdateConfig', {
        version: "1.0.0",
        downloadUrl: "https://example.com/app.apk",
        forceUpdate: false
    });

    const bannedDocs = await BannedDevice.find({});
    const bannedHWIDs = bannedDocs.map(b => b.hwid);

    const userDocs = await User.find({});
    const usersObj = {};
    userDocs.forEach(u => {
        usersObj[u.key] = {
            expiry: u.expiry,
            deviceLimit: u.deviceLimit,
            loggedDevices: u.loggedDevices
        };
    });

    res.json({
        settings: systemSettings,
        announcement: globalAnnouncement,
        update: appUpdateConfig,
        bannedHWIDs: bannedHWIDs,
        users: usersObj
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on Port: ${PORT}`));
