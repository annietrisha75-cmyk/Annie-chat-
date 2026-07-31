// ==========================================
// FILE 1: server.js
// ==========================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Admin Login Check
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === 'felix123') {
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Invalid password' });
});

// Real-time signaling map
const users = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join', (data) => {
        users[socket.id] = { email: data.email, role: data.role };
        socket.join(data.role === 'admin' ? 'admin-room' : 'visitor-room');
        
        if (data.role === 'visitor') {
            io.emit('visitor-online', { email: data.email, id: socket.id });
        }
    });

    // Signaling relays for WebRTC Video Calls
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', { offer: data.offer, sender: socket.id });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', { answer: data.answer, sender: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', { candidate: data.candidate });
    });

    // Admin triggers injecting custom video playback to target visitor
    socket.on('admin-send-video', (data) => {
        io.to(data.target).emit('play-injected-video', { videoUrl: data.videoUrl });
    });

    // End call signal
    socket.on('end-call', (data) => {
        socket.to(data.target).emit('force-end-call');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
