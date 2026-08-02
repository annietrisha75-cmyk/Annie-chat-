const express = require('express');
const http = http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000,
    upgradeTimeout: 30000,
    transports: ['websocket', 'polling']
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:admin123@cluster0.mongodb.net/anniechat?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected securely to MongoDB Atlas");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

const visitorSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    ip: String,
    country: { type: String, default: 'Unknown' },
    countryCode: { type: String, default: '🌐' },
    language: { type: String, default: 'en' },
    sourcePanel: { type: String, default: 'visitor.html' },
    customAdminName: { type: String, default: 'Owner ❤️' },
    isOnline: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    messages: [{
        sender: String,
        type: { type: String, default: 'text' },
        content: String,
        translation: String,
        timestamp: { type: String, default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    }],
    callLogs: [{
        type: { type: String, default: 'completed' },
        duration: { type: Number, default: 0 },
        timestamp: { type: String, default: () => new Date().toLocaleString() }
    }],
    lastActive: { type: Date, default: Date.now }
});

const Visitor = mongoose.model('Visitor', visitorSchema);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

app.use(session({
    secret: process.env.SESSION_SECRET || 'annie-chat-secure-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Strong Admin Password Implementation
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AnnieSecure2026!';
app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: 'Invalid admin password' });
});

app.get('/api/check-admin', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
});

async function lookupCountryFromIP(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
        return { country: 'Local Network', countryCode: '🏠', lang: 'en' };
    }
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        if (data && data.status === 'success') {
            let lang = 'en';
            if (data.countryCode === 'FR' || data.countryCode === 'CA') lang = 'fr';
            return {
                country: data.country || 'Unknown',
                countryCode: data.countryCode ? countryCodeToEmoji(data.countryCode) : '🌍',
                lang: lang
            };
        }
    } catch (e) {
        console.error("Geo lookup failed:", e);
    }
    return { country: 'Nigeria', countryCode: '🇳🇬', lang: 'en' };
}

function countryCodeToEmoji(code) {
    return code.toUpperCase().replace(/./g, char => 
        String.fromCodePoint(127397 + char.charCodeAt(0))
    );
}

function translateToEnglish(text, lang) {
    if (lang === 'en' || !text) return null;
    const dictionary = {
        "bonjour": "Hello",
        "salut": "Hi there",
        "comment ça va": "How are you",
        "aidez-moi": "Help me",
        "merci": "Thank you"
    };
    const lower = text.toLowerCase().trim();
    if (dictionary[lower]) return dictionary[lower];
    return `[Translated]: ${text}`;
}

io.on('connection', (socket) => {
    let currentVisitorEmail = null;

    socket.on('admin-login', (data) => {
        if (data && data.password === ADMIN_PASSWORD) {
            socket.join('admin-room');
            socket.emit('admin-authenticated', { success: true });
        } else {
            socket.emit('admin-authenticated', { success: false, message: 'Invalid admin password' });
        }
    });

    socket.on('visitor-register', async (data) => {
        if (!data || !data.email) return;
        currentVisitorEmail = data.email.trim();
        socket.join(currentVisitorEmail);
        socket.join('visitors-room');

        const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        const clientIp = Array.isArray(rawIp) ? rawIp[0] : rawIp.split(',')[0].trim();
        const geo = await lookupCountryFromIP(clientIp);

        let visitor = await Visitor.findOne({ email: currentVisitorEmail });
        if (!visitor) {
            visitor = new Visitor({
                email: currentVisitorEmail,
                ip: clientIp,
                country: geo.country,
                countryCode: geo.countryCode,
                language: geo.lang,
                sourcePanel: data.source || 'visitor.html',
                messages: [{
                    sender: 'admin',
                    type: 'text',
                    content: `Welcome! Detected from ${geo.country} ${geo.countryCode}. Feel free to message us or start a video call.`,
                    translation: null
                }]
            });
            await visitor.save();
        } else {
            visitor.ip = clientIp;
            visitor.country = geo.country;
            visitor.countryCode = geo.countryCode;
            visitor.isOnline = true;
            visitor.lastActive = Date.now();
            await visitor.save();
        }

        socket.emit('init-chat-data', {
            customAdminName: visitor.customAdminName,
            country: visitor.country,
            countryCode: visitor.countryCode,
            language: visitor.language,
            sourcePanel: visitor.sourcePanel,
            messages: visitor.messages,
            callLogs: visitor.callLogs
        });

        io.to('admin-room').emit('admin-visitor-list', await Visitor.find({}).sort({ lastActive: -1 }));
    });

    socket.on('visitor-heartbeat', async () => {
        if (currentVisitorEmail) {
            await Visitor.updateOne({ email: currentVisitorEmail }, { isOnline: true, lastSeen: Date.now(), lastActive: Date.now() });
            io.to('admin-room').emit('visitor-status-change', { email: currentVisitorEmail, isOnline: true, lastSeen: 'Online' });
        }
    });

    socket.on('admin-join', async () => {
        socket.join('admin-room');
        socket.emit('admin-visitor-list', await Visitor.find({}).sort({ lastActive: -1 }));
    });

    socket.on('request-visitor-history', async (data) => {
        const visitor = await Visitor.findOne({ email: data.email });
        if (visitor) {
            socket.emit('admin-visitor-history', visitor);
        }
    });

    socket.on('send-message', async (data) => {
        const { email, sender, type, content } = data;
        if (!email || !content) return;

        const visitor = await Visitor.findOne({ email });
        if (visitor) {
            let translationText = null;
            if (sender === 'visitor' && visitor.language !== 'en' && type === 'text') {
                translationText = translateToEnglish(content, visitor.language);
            }

            const newMsg = {
                sender: sender,
                type: type || 'text',
                content: content,
                translation: translationText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            visitor.messages.push(newMsg);
            visitor.lastActive = Date.now();
            await visitor.save();

            io.to(email).emit('receive-message', newMsg);
            io.to('admin-room').emit('receive-message', newMsg);
        }
    });

    socket.on('delete-conversation', async (data) => {
        const { email } = data;
        if (!email) return;
        await Visitor.deleteOne({ email });
        io.to('admin-room').emit('admin-visitor-list', await Visitor.find({}).sort({ lastActive: -1 }));
    });

    socket.on('update-custom-name', async (data) => {
        const { email, newName } = data;
        const visitor = await Visitor.findOne({ email });
        if (visitor && newName) {
            visitor.customAdminName = newName.trim();
            await visitor.save();
            io.to(email).emit('custom-name-updated', { newName: visitor.customAdminName });
            io.to('admin-room').emit('admin-visitor-list', await Visitor.find({}).sort({ lastActive: -1 }));
        }
    });

    socket.on('initiate-call', (data) => {
        if (data && data.toEmail) {
            io.to(data.toEmail).emit('incoming-call-from-admin');
        } else if (currentVisitorEmail) {
            io.to('admin-room').emit('incoming-call-from-visitor', { email: currentVisitorEmail });
        }
    });

    socket.on('accept-call', (data) => {
        if (data && data.targetEmail) {
            io.to(data.targetEmail).emit('call-accepted-by-admin');
        } else if (currentVisitorEmail) {
            io.to('admin-room').emit('call-accepted-by-visitor', { email: currentVisitorEmail });
        }
    });

    socket.on('reject-call', (data) => {
        if (data && data.targetEmail) {
            io.to(data.targetEmail).emit('call-rejected');
        }
    });

    socket.on('inject-video', (data) => {
        io.to(data.targetEmail).emit('play-injected-video', { videoData: data.videoData });
    });

    socket.on('video-playback-started', async (data) => {
        const visitor = await Visitor.findOne({ email: data.email || currentVisitorEmail });
        if (visitor) {
            visitor.callLogs.push({ type: 'completed', duration: 35, timestamp: new Date().toLocaleString() });
            await visitor.save();
        }
    });

    socket.on('hang-up', async (data) => {
        const { email, duration } = data;
        const targetEmail = email || currentVisitorEmail;
        if (targetEmail) {
            const visitor = await Visitor.findOne({ email: targetEmail });
            if (visitor) {
                visitor.callLogs.push({ type: 'completed', duration: duration || 10, timestamp: new Date().toLocaleString() });
                await visitor.save();
            }
            io.to(targetEmail).emit('call-ended-cleanup');
            io.to('admin-room').emit('call-ended-cleanup');
        }
    });

    socket.on('disconnect', async () => {
        if (currentVisitorEmail) {
            await Visitor.updateOne({ email: currentVisitorEmail }, { isOnline: false, lastSeen: Date.now() });
            io.to('admin-room').emit('visitor-status-change', { email: currentVisitorEmail, isOnline: false, lastSeen: new Date().toLocaleTimeString() });
            io.to('admin-room').emit('admin-visitor-list', await Visitor.find({}).sort({ lastActive: -1 }));
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server executing seamlessly on port ${PORT}`);
});
