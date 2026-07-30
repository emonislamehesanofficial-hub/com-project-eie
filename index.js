const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";

// ==========================================
// 🔑 ইউজার কী ও মেম্বারশিপ ডেটাবেজ (Database simulation)
// ==========================================
// Expiration date format: YYYY-MM-DD
const usersDatabase = {
    "VIP-EMON-2026": {
        expiry: "2026-12-31", // ২০২৬ সালের ৩১ ডিসেম্বর পর্যন্ত মেয়াদ
        hwid: null             // প্রথম লগইনে অটোমেটিক লক হবে
    },
    "USER-TEST-123": {
        expiry: "2026-08-15", // ২০২৬ সালের ১৫ আগস্ট পর্যন্ত মেয়াদ
        hwid: "ABCD-1234-XYZ" // নির্দিষ্ট HWID লক করা
    }
};

app.post('/connect/b2k', (req, res) => {
    const clientApiKey = req.headers['x-api-key'];
    
    // API Key ভ্যালিডেশন
    if (clientApiKey !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Server Error: Unauthorized API Key" });
    }

    const game = req.body.game;
    const userKey = req.body.user_key;
    const serial = req.body.serial; // HWID

    // ১. ডেটা ইনপুট চেক
    if (!userKey || !serial) {
        return res.json({ status: false, reason: "Key or HWID Missing!" });
    }

    // ২. ইউজার কী ব্যাকএন্ডে আছে কি না চেক
    const user = usersDatabase[userKey];
    if (!user) {
        return res.json({ status: false, reason: "Invalid User Key!" });
    }

    // ৩. এক্সপায়ারি ডেট (Expiry Date) চেক
    const today = new Date().toISOString().split('T')[0]; // আজকের তারিখ (YYYY-MM-DD)
    if (today > user.expiry) {
        return res.json({ status: false, reason: "Your Key Has Expired!" });
    }

    // ৪. HWID Lock চেক (প্রথমবার লগইন করলে HWID লক হয়ে যাবে)
    if (user.hwid === null) {
        user.hwid = serial; // Auto Lock to this device
    } else if (user.hwid !== serial) {
        return res.json({ status: false, reason: "HWID Mismatched! Device Locked." });
    }

    // ৫. সিকিউরিটি টোকেন তৈরি (C++ কোডের সাথে ভ্যালিডেশন)
    const rawString = `${game}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    // সফল রেসপন্স
    return res.json({
        status: true,
        data: {
            token: generatedToken,
            expiry: user.expiry
        },
        reason: "Login Success"
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
