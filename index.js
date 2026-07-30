const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SECRET_SALT = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
const API_KEY = "X7B4N2P8Q9W3Z6M5";

// ==========================================
// 🔑 ডাটাবেজ সিমুলেশন
// ==========================================
const usersDatabase = {
    "VIP-EMON-2026": {
        expiry: "2026-12-31",
        deviceLimit: 2,
        isBanned: false,
        banReason: "",
        loggedDevices: []
    }
};

// 🎮 ১. C++ / Android Client Auth Endpoint
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
        if(device_name) existingDevice.name = device_name;
    }

    const rawString = `${game}-${userKey}-${serial}-${SECRET_SALT}`;
    const generatedToken = crypto.createHash('md5').update(rawString).digest('hex');

    return res.json({
        status: true,
        data: { token: generatedToken, expiry: user.expiry },
        reason: "Login Success"
    });
});

// ==========================================
// 👑 ২. Admin Dashboard APIs (Key Gen, Ban, Unban, Reset)
// ==========================================

// Create Key
app.post('/admin/create-key', (req, res) => {
    const { key, expiry, limit } = req.body;
    if (!key || !expiry) return res.json({ status: false, message: "Key & Expiry required!" });

    usersDatabase[key] = {
        expiry: expiry,
        deviceLimit: parseInt(limit) || 1,
        isBanned: false,
        banReason: "",
        loggedDevices: []
    };
    res.json({ status: true, message: "Key Created Successfully!" });
});

// Ban/Unban Key
app.post('/admin/toggle-ban', (req, res) => {
    const { key, ban, reason } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].isBanned = ban;
        usersDatabase[key].banReason = reason || "";
        return res.json({ status: true, message: `Key ${key} ${ban ? 'Banned' : 'Unbanned'}!` });
    }
    res.json({ status: false, message: "Key not found!" });
});

// Reset HWID / Clear Devices
app.post('/admin/reset-hwid', (req, res) => {
    const { key } = req.body;
    if (usersDatabase[key]) {
        usersDatabase[key].loggedDevices = [];
        return res.json({ status: true, message: `Devices Reset for Key: ${key}` });
    }
    res.json({ status: false, message: "Key not found!" });
});

// Get All Users Data
app.get('/admin/api/users', (req, res) => res.json(usersDatabase));

// 🌐 3. HTML Admin Dashboard Website Page
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Emon Auth - Admin Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #121212; color: #fff; margin: 0; padding: 20px; }
            h1 { color: #4DA6FF; text-align: center; }
            .card { background: #1E1E1E; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            input, button, select { padding: 10px; margin: 5px 0; border-radius: 5px; border: 1px solid #333; background: #2A2A2A; color: #fff; }
            button { background: #007ACC; cursor: pointer; border: none; font-weight: bold; }
            button:hover { background: #005999; }
            .ban-btn { background: #E74C3C; }
            .reset-btn { background: #F39C12; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #333; padding: 10px; text-align: left; font-size: 14px; }
            th { background: #252526; }
            .badge { padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .active { background: #2ECC71; color: #000; }
            .banned { background: #E74C3C; color: #fff; }
        </style>
    </head>
    <body>
        <h1>🔥 Emon Auth Admin Panel</h1>
        
        <div class="card">
            <h3>🔑 Create New Key</h3>
            <input type="text" id="keyName" placeholder="Enter Key Name (e.g. EMON-999)">
            <input type="date" id="expiryDate">
            <input type="number" id="devLimit" placeholder="Device Limit (Default: 1)" value="1">
            <button onclick="createKey()">Generate Key</button>
        </div>

        <div class="card">
            <h3>📱 All Registered Keys & Devices</h3>
            <table>
                <thead>
                    <tr>
                        <th>Key Name</th>
                        <th>Expiry Date</th>
                        <th>Device Limit</th>
                        <th>Status</th>
                        <th>Logged Devices Info</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="userList"></tbody>
            </table>
        </div>

        <script>
            async function loadUsers() {
                const res = await fetch('/admin/api/users');
                const data = await res.json();
                const tbody = document.getElementById('userList');
                tbody.innerHTML = '';

                for(let key in data) {
                    let u = data[key];
                    let devInfo = u.loggedDevices.map(d => \`<b>Name:</b> \${d.name} | <b>HWID:</b> \${d.hwid} | <b>IP:</b> \${d.ip} | <b>OS:</b> \${d.androidVer}\`).join('<br><hr>');
                    let statusBadge = u.isBanned ? '<span class="badge banned">BANNED</span>' : '<span class="badge active">ACTIVE</span>';

                    tbody.innerHTML += \`
                        <tr>
                            <td><b>\${key}</b></td>
                            <td>\${u.expiry}</td>
                            <td>\${u.loggedDevices.length} / \${u.deviceLimit}</td>
                            <td>\${statusBadge}</td>
                            <td>\${devInfo || 'No device logged in'}</td>
                            <td>
                                <button class="ban-btn" onclick="toggleBan('\${key}', \${!u.isBanned})">\${u.isBanned ? 'Unban' : 'Ban'}</button>
                                <button class="reset-btn" onclick="resetHWID('\${key}')">Reset HWID</button>
                            </td>
                        </tr>
                    \`;
                }
            }

            async function createKey() {
                const key = document.getElementById('keyName').value;
                const expiry = document.getElementById('expiryDate').value;
                const limit = document.getElementById('devLimit').value;
                if(!key || !expiry) return alert('Fill all fields');

                await fetch('/admin/create-key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ key, expiry, limit })
                });
                alert('Key Created!');
                loadUsers();
            }

            async function toggleBan(key, ban) {
                let reason = ban ? prompt('Enter Ban Reason:') : '';
                await fetch('/admin/toggle-ban', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ key, ban, reason })
                });
                loadUsers();
            }

            async function resetHWID(key) {
                if(confirm('Reset all devices for ' + key + '?')) {
                    await fetch('/admin/reset-hwid', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ key })
                    });
                    loadUsers();
                }
            }

            loadUsers();
            setInterval(loadUsers, 5000); // 5 সেকেন্ড পর পর রিয়েল-টাইম আপডেট হবে
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
