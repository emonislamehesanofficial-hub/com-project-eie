const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";

app.post('/connect/b2k', (req, res) => {
    const clientApiKey = req.headers['x-api-key'];
    if (clientApiKey !== API_KEY) {
        return res.status(401).json({ status: false, reason: "Unauthorized API Key" });
    }

    const game = req.body.game;
    const userKey = req.body.user_key;
    const serial = req.body.serial;

    if (!userKey || !serial) {
        return res.json({ status: false, reason: "Key or HWID missing!" });
    }

    const rawString = `${game}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    return res.json({
        status: true,
        data: {
            token: generatedToken
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
