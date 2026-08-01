const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const rateLimit = require('express-rate-limit');

// --- GLOBAL ERROR BOUNDARY & UNCAUGHT EXCEPTION HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error('Caught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB limit to handle video data injection payloads
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- RATE LIMITING & BRUTE-FORCE PROTECTION ---
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://samdrajames205_db_user:felix123@cluster0.7j6ppge.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected securely to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- DATABASE SCHEMAS (WITH INDEXING OPTIMIZATION) ---
const MessageSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    sender: { type: String, required: true }, // 'visitor' or 'admin'
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), index: true }
});

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },
    customAdminName: { type: String, default: "Owner ❤️" },
    lastSeen: { type: String, default: "Online" },
    isOnline: { type: Boolean, default: true }
});

const CallLogSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    type: { type: String, enum: ['missed', 'completed'], default: 'completed' },
    duration: { type: Number, default: 0 },
    timestamp: { type: String, default: () => new Date().toLocaleString() }
});

const Message = mongoose.model('Message', MessageSchema);
const User = mongoose.model('User', UserSchema);
const CallLog = mongoose.model('CallLog', CallLogSchema);

// Serve static assets from the /public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// Memory maps to track active socket connections
const activeVisitors = new Map(); // email -> socket.id
let activeAdminSocket = null;

io.on('connection', (socket) => {
    
    // --- CONNECTION KEEP-ALIVE & HEARTBEAT PING ---
    socket.on('heartbeat', () => {
        socket.emit('heartbeat-ack');
    });

    // --- VISITOR AUTHENTICATION & INITIALIZATION ---
    socket.on('visitor-register', async ({ email }) => {
        if (!email) return;
        socket.email = email;
        activeVisitors.set(email, socket.id);

        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({ email, isOnline: true, lastSeen: 'Online' });
        } else {
            user.isOnline = true;
            user.lastSeen = 'Online';
            await user.save();
        }

        const messages = await Message.find({ email }).sort({ _id: 1 });
        const callLogs = await CallLog.find({ email }).sort({ _id: -1 });

        socket.emit('init-chat-data', {
            customAdminName: user.customAdminName,
            messages,
            callLogs
        });

        // Broadcast status update to Admin Panel
        if (activeAdminSocket) {
            io.to(activeAdminSocket).emit('visitor-status-change', { email, isOnline: true, lastSeen: 'Online' });
            sendAdminVisitorList();
        }
    });

    // --- ADMIN AUTHENTICATION ---
    socket.on('admin-login', async ({ password }) => {
        if (password === 'felix123321@') {
            activeAdminSocket = socket.id;
            socket.emit('admin-authenticated', { success: true });
            sendAdminVisitorList();
        } else {
            socket.emit('admin-authenticated', { success: false, message: 'Invalid Admin Password' });
        }
    });

    // --- MESSAGING ENGINE ---
    socket.on('send-message', async ({ email, sender, type, content }) => {
        if (!email || !content) return;

        const newMsg = await Message.create({ email, sender, type, content });
        
        // Dispatch to Visitor socket if online
        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) {
            io.to(visitorSocketId).emit('receive-message', newMsg);
        }

        // Dispatch to Admin socket if online
        if (activeAdminSocket) {
            io.to(activeAdminSocket).emit('receive-message', newMsg);
        }
    });

    // --- SETTINGS ENGINE ---
    socket.on('update-custom-name', async ({ email, newName }) => {
        // Update globally across database users so all threads sync the new custom admin name
        await User.updateMany({}, { customAdminName: newName });

        // Notify all active visitors currently online about the custom name change
        activeVisitors.forEach((socketId, visitorEmail) => {
            const visitorSocket = io.sockets.sockets.get(socketId);
            if (visitorSocket) {
                visitorSocket.emit('custom-name-updated', { newName });
            }
        });
    });

    // --- TWO-WAY CALLING & VIDEO INJECTION ---
    socket.on('initiate-call', ({ from, toEmail }) => {
        if (from === 'visitor') {
            if (activeAdminSocket) {
                io.to(activeAdminSocket).emit('incoming-call-from-visitor', { email: socket.email });
            }
        } else if (from === 'admin') {
            const visitorSocketId = activeVisitors.get(toEmail);
            if (visitorSocketId) {
                io.to(visitorSocketId).emit('incoming-call-from-admin');
            }
        }
    });

    socket.on('accept-call', ({ targetEmail, acceptedBy }) => {
        if (acceptedBy === 'admin') {
            const visitorSocketId = activeVisitors.get(targetEmail);
            if (visitorSocketId) {
                io.to(visitorSocketId).emit('call-accepted-by-admin');
            }
        } else {
            if (activeAdminSocket) {
                io.to(activeAdminSocket).emit('call-accepted-by-visitor', { email: socket.email });
            }
        }
    });

    socket.on('reject-call', async ({ targetEmail }) => {
        const email = targetEmail || socket.email;
        await CallLog.create({ email, type: 'missed', duration: 0 });

        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) io.to(visitorSocketId).emit('call-rejected');
        if (activeAdminSocket) io.to(activeAdminSocket).emit('call-rejected');
    });

    socket.on('inject-video', ({ targetEmail, videoData }) => {
        const visitorSocketId = activeVisitors.get(targetEmail);
        if (visitorSocketId) {
            io.to(visitorSocketId).emit('play-injected-video', { videoData });
        }
    });

    // Relay video playback confirmation signal back to the admin dashboard
    socket.on('video-playback-started', (data) => {
        if (activeAdminSocket && data && data.email) {
            io.to(activeAdminSocket).emit('video-playback-confirmed', { email: data.email });
        }
    });

    socket.on('hang-up', async ({ email, duration }) => {
        if (email) {
            await CallLog.create({ email, type: 'completed', duration: duration || 0 });
        }
        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) visitorSocketId.emit('call-ended-cleanup');
        if (activeAdminSocket) io.to(activeAdminSocket).emit('call-ended-cleanup');
    });

    socket.on('admin-end-call', ({ email }) => {
        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) {
            const targetSocket = io.sockets.sockets.get(visitorSocketId);
            if (targetSocket) targetSocket.emit('call-ended-cleanup');
        }
    });

    // --- CONVERSATION MANAGEMENT ---
    socket.on('delete-conversation', async ({ email }) => {
        if (!email) return;
        await Message.deleteMany({ email });
        await CallLog.deleteMany({ email });
        await User.deleteOne({ email });
        activeVisitors.delete(email);
        sendAdminVisitorList();
    });

    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', async () => {
        if (socket.email) {
            const timeStr = `Last seen today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            await User.findOneAndUpdate({ email: socket.email }, { isOnline: false, lastSeen: timeStr });
            activeVisitors.delete(socket.email);

            if (activeAdminSocket) {
                io.to(activeAdminSocket).emit('visitor-status-change', { email: socket.email, isOnline: false, lastSeen: timeStr });
            }
        }
        if (socket.id === activeAdminSocket) {
            activeAdminSocket = null;
        }
    });

    async function sendAdminVisitorList() {
        const users = await User.find().sort({ _id: -1 });
        if (activeAdminSocket) {
            io.to(activeAdminSocket).emit('admin-visitor-list', users);
        }
    }

    socket.on('request-visitor-history', async ({ email }) => {
        const messages = await Message.find({ email }).sort({ _id: 1 });
        const callLogs = await CallLog.find({ email }).sort({ _id: -1 });
        socket.emit('admin-visitor-history', { email, messages, callLogs });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server executing seamlessly on port ${PORT}`));
