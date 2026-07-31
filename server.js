const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB limit to handle video data injection payloads
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://samdrajames205_db_user:felix123@cluster0.7j6ppge.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected securely to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Database Schemas
const MessageSchema = new mongoose.Schema({
    email: { type: String, required: true },
    sender: { type: String, required: true }, // 'visitor' or 'admin'
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
});

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    customAdminName: { type: String, default: "Owner ❤️" },
    lastSeen: { type: String, default: "Online" },
    isOnline: { type: Boolean, default: true }
});

const CallLogSchema = new mongoose.Schema({
    email: { type: String, required: true },
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
        if (password === 'felix123') {
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
        await User.findOneAndUpdate({ email }, { customAdminName: newName });
        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) {
            io.to(visitorSocketId).emit('custom-name-updated', { newName });
        }
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

    socket.on('hang-up', async ({ email, duration }) => {
        if (email) {
            await CallLog.create({ email, type: 'completed', duration: duration || 0 });
        }
        const visitorSocketId = activeVisitors.get(email);
        if (visitorSocketId) io.to(visitorSocketId).emit('call-ended-cleanup');
        if (activeAdminSocket) io.to(activeAdminSocket).emit('call-ended-cleanup');
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
    });

    async function sendAdminVisitorList() {
        const users = await User.find().sort({ _id: -1 });
        if (activeAdminSocket) {
            io.to(activeAdminSocket).emit('admin-visitor-list', users);
        }
    }

    socket.on('request-visitor-history', async ({ email }) => {
        const messages = await Message.find({ email }).sort({ _id: 1 });
        socket.emit('admin-visitor-history', { email, messages });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server executing seamlessly on port ${PORT}`));
