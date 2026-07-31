require('dotenv').config(); // Loads secret values from .env file

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 }); // 100MB limit for video/image buffering

// Read connection string securely from process.env
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB permanently.'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- DATABASE SCHEMAS ---

// Messages (Permanent Storage)
const messageSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    sender: { type: String, enum: ['visitor', 'admin'], required: true },
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// User Profiles & Settings
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    adminName: { type: String, default: 'Owner ❤️' }, // Visitor's custom name for Admin
    lastSeen: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false }
});

// Call Logs
const callLogSchema = new mongoose.Schema({
    email: { type: String, required: true },
    status: { type: String, enum: ['missed', 'completed'], default: 'missed' },
    duration: { type: Number, default: 0 }, // in seconds
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
const User = mongoose.model('User', userSchema);
const CallLog = mongoose.model('CallLog', callLogSchema);

// --- EXPRESS SETUP ---
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serves frontend files

// Active Tracking
const activeVisitors = new Map(); // email -> socket.id
let adminSocketId = null;

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    
    // 1. ADMIN AUTHENTICATION
    socket.on('admin-login', async (password) => {
        if (password === 'felix123') {
            adminSocketId = socket.id;
            const users = await User.find().sort({ lastSeen: -1 });
            socket.emit('admin-auth-success', users);
            console.log('Admin connected.');
        } else {
            socket.emit('admin-auth-fail');
        }
    });

    // 2. VISITOR REGISTRATION & SETTINGS
    socket.on('register-visitor', async (email) => {
        activeVisitors.set(email, socket.id);
        socket.email = email;
        
        let user = await User.findOneAndUpdate(
            { email }, 
            { isOnline: true, lastSeen: Date.now() }, 
            { upsert: true, new: true }
        );
        
        // Send history and user config to visitor
        const history = await Message.find({ email }).sort({ timestamp: 1 });
        const calls = await CallLog.find({ email }).sort({ timestamp: -1 });
        socket.emit('visitor-init-data', { user, history, calls });

        // Notify admin
        if (adminSocketId) {
            const users = await User.find().sort({ lastSeen: -1 });
            io.to(adminSocketId).emit('update-visitor-list', users);
            io.to(adminSocketId).emit('visitor-status-change', { email, isOnline: true });
        }
    });

    socket.on('update-admin-name', async (data) => {
        const { email, newName } = data;
        await User.findOneAndUpdate({ email }, { adminName: newName });
    });

    // 3. MESSAGING (TEXT & IMAGE)
    socket.on('send-message', async (data) => {
        const { email, sender, type, content } = data;
        const msg = new Message({ email, sender, type, content });
        await msg.save();

        if (sender === 'visitor' && adminSocketId) {
            io.to(adminSocketId).emit('receive-message', msg);
        } else if (sender === 'admin') {
            const visitorSocket = activeVisitors.get(email);
            if (visitorSocket) io.to(visitorSocket).emit('receive-message', msg);
        }
    });

    // 4. CALLING LOGIC (TWO-WAY)
    // Visitor calls Admin
    socket.on('visitor-call-admin', (email) => {
        if (adminSocketId) io.to(adminSocketId).emit('incoming-call-from-visitor', email);
    });

    // Admin calls Visitor
    socket.on('admin-call-visitor', (email) => {
        const visitorSocket = activeVisitors.get(email);
        if (visitorSocket) io.to(visitorSocket).emit('incoming-call-from-admin');
    });

    // Admin accepts visitor's call
    socket.on('admin-accept-call', (email) => {
        const visitorSocket = activeVisitors.get(email);
        if (visitorSocket) io.to(visitorSocket).emit('call-accepted');
    });

    // Visitor accepts admin's call
    socket.on('visitor-accept-call', (email) => {
        if (adminSocketId) io.to(adminSocketId).emit('visitor-answered-call', email);
    });

    // Inject Video Stream
    socket.on('inject-video', (data) => {
        const { email, videoData } = data;
        const visitorSocket = activeVisitors.get(email);
        if (visitorSocket) io.to(visitorSocket).emit('play-injected-video', { videoData });
    });

    // End/Log Call
    socket.on('end-call', async (data) => {
        const { email, status, duration } = data; // status: 'missed' or 'completed'
        await CallLog.create({ email, status, duration });
        
        const visitorSocket = activeVisitors.get(email);
        if (visitorSocket) io.to(visitorSocket).emit('call-ended');
        if (adminSocketId) io.to(adminSocketId).emit('call-ended');
    });

    // 5. DISCONNECT
    socket.on('disconnect', async () => {
        if (socket.email) {
            activeVisitors.delete(socket.email);
            await User.findOneAndUpdate({ email: socket.email }, { isOnline: false, lastSeen: Date.now() });
            if (adminSocketId) io.to(adminSocketId).emit('visitor-status-change', { email: socket.email, isOnline: false });
        }
        if (socket.id === adminSocketId) {
            adminSocketId = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
