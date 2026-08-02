/**
 * BACKEND SERVER FOR TELEGRAM-STYLE CUSTOM MESSENGER & ADMIN PANEL
 * Handles MongoDB persistence, WebSockets (Socket.io), Admin authentication, and Video Call Injection.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://samdrajames205_db_user:felix123@cluster0.7j6ppge.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'annie-chat-secure-secret-key-99!',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
});

app.use(sessionMiddleware);

// Rate limiting for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { success: false, message: 'Too many login attempts, please try again later.' }
});

// --- MONGODB MODELS ---
const MessageSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    sender: { type: String, enum: ['user', 'admin'], required: true },
    type: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true }
});

const CallLogSchema = new mongoose.Schema({
    email: { type: String, required: true },
    duration: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true }
});

const Message = mongoose.model('Message', MessageSchema);
const CallLog = mongoose.model('CallLog', CallLogSchema);

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected securely to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- HTTP ROUTES ---
app.post('/api/admin-login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.json({ success: true, redirect: '/Admin.html' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid admin password' });
    }
});

app.get('/admin.html', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'Admin.html'));
    } else {
        res.redirect('/');
    }
});

// --- SOCKET.IO REAL-TIME ENGINE ---
const connectedUsers = new Map(); // email -> socket.id
const adminSockets = new Set();

io.on('connection', (socket) => {
    
    // Heartbeat handling
    socket.on('heartbeat', () => {
        socket.emit('heartbeat-ack');
    });

    // Admin Login via Socket
    socket.on('admin-login', async ({ password }) => {
        if (password === ADMIN_PASSWORD) {
            adminSockets.add(socket.id);
            socket.isAdmin = true;
            socket.emit('admin-authenticated', { success: true });
            
            // Send current online visitor list
            broadcastVisitorList();
        } else {
            socket.emit('admin-authenticated', { success: false, message: 'Incorrect admin password' });
        }
    });

    // User or Visitor registering presence
    socket.on('register-visitor', ({ email }) => {
        if (!email) return;
        socket.userEmail = email;
        connectedUsers.set(email, socket.id);
        broadcastVisitorList();
        
        socket.broadcast.emit('visitor-status-change', { email, isOnline: true, lastSeen: 'Online' });
    });

    // Request visitor history for admin panel
    socket.on('request-visitor-history', async ({ email }) => {
        if (!socket.isAdmin) return;
        try {
            const messages = await Message.find({ email }).sort({ timestamp: 1 });
            socket.emit('admin-visitor-history', { email, messages });
        } catch (err) {
            console.error('Error fetching visitor history:', err);
        }
    });

    // Send Message handler
    socket.on('send-message', async (msgData) => {
        try {
            const { email, sender, type, content } = msgData;
            if (!email || !content) return;

            const newMsg = new Message({ email, sender, type: type || 'text', content });
            await newMsg.save();

            // Deliver to recipient if online
            if (sender === 'admin') {
                const userSocketId = connectedUsers.get(email);
                if (userSocketId) {
                    io.to(userSocketId).emit('receive-message', newMsg);
                }
            } else {
                // Deliver to all connected admins
                adminSockets.forEach(adminId => {
                    io.to(adminId).emit('receive-message', newMsg);
                });
            }

            // Confirm back to sender
            socket.emit('message-sent-ack', newMsg);
        } catch (err) {
            console.error('Error saving/sending message:', err);
        }
    });

    // Delete conversation thread
    socket.on('delete-conversation', async ({ email }) => {
        if (!socket.isAdmin || !email) return;
        try {
            await Message.deleteMany({ email });
            broadcastVisitorList();
        } catch (err) {
            console.error('Error deleting conversation:', err);
        }
    });

    // --- CALL SIGNALING & VIDEO INJECTION ---
    socket.on('initiate-call', ({ from, toEmail }) => {
        if (from === 'admin') {
            const targetSocketId = connectedUsers.get(toEmail);
            if (targetSocketId) {
                io.to(targetSocketId).emit('incoming-call-from-visitor', { email: toEmail });
            }
        }
    });

    socket.on('accept-call', ({ targetEmail, acceptedBy }) => {
        const targetSocketId = connectedUsers.get(targetEmail);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-accepted', { acceptedBy });
        }
        adminSockets.forEach(adminId => {
            io.to(adminId).emit('call-accepted', { targetEmail });
        });
    });

    socket.on('reject-call', ({ targetEmail }) => {
        const targetSocketId = connectedUsers.get(targetEmail);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-rejected');
        }
        adminSockets.forEach(adminId => {
            io.to(adminId).emit('call-rejected', { targetEmail });
        });
    });

    socket.on('inject-video', ({ targetEmail, videoData }) => {
        const targetSocketId = connectedUsers.get(targetEmail);
        if (targetSocketId) {
            io.to(targetSocketId).emit('play-injected-video', { videoData });
            socket.emit('video-playback-confirmed', { email: targetEmail });
        }
    });

    socket.on('hang-up', async ({ email, duration }) => {
        if (email && duration > 0) {
            try {
                await CallLog.create({ email, duration });
            } catch (err) {
                console.error('Error saving call log:', err);
            }
        }
        const targetSocketId = connectedUsers.get(email);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-ended-cleanup');
        }
        adminSockets.forEach(adminId => {
            io.to(adminId).emit('call-ended-cleanup', { email });
        });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        if (socket.isAdmin) {
            adminSockets.delete(socket.id);
        }
        if (socket.userEmail) {
            connectedUsers.delete(socket.userEmail);
            const lastSeenTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            socket.broadcast.emit('visitor-status-change', { email: socket.userEmail, isOnline: false, lastSeen: `Last seen ${lastSeenTime}` });
            broadcastVisitorList();
        }
    });
});

async function broadcastVisitorList() {
    try {
        // Aggregate all unique visitor emails from messages or active connections
        const distinctEmails = await Message.distinct('email');
        const allEmails = new Set([...distinctEmails, ...connectedUsers.keys()]);
        
        const visitorList = [];
        for (const email of allEmails) {
            const isOnline = connectedUsers.has(email);
            visitorList.push({
                email,
                isOnline,
                lastSeen: isOnline ? 'Online' : 'Offline'
            });
        }

        adminSockets.forEach(adminId => {
            io.to(adminId).emit('admin-visitor-list', visitorList);
        });
    } catch (err) {
        console.error('Error broadcasting visitor list:', err);
    }
}

// Start Server
server.listen(PORT, () => {
    console.log(`Server executing seamlessly on port ${PORT}`);
});
