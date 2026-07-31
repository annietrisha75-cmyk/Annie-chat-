const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 1. Persistent Messages: SQLite database initialization
const db = new Database('chat_history.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'felix123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const activeVisitors = new Map(); // visitorId -> socket.id

io.on('connection', (socket) => {
    // 2. Visitor Registration & Auto-sync on connection
    socket.on('register_visitor', ({ visitorId, email }) => {
        if (!visitorId) return;
        
        socket.visitorId = visitorId;
        socket.visitorEmail = email || 'Visitor';
        activeVisitors.set(visitorId, socket.id);
        socket.join(visitorId);

        // Fetch full message history from SQLite
        const history = db.prepare('SELECT * FROM messages WHERE visitor_id = ? ORDER BY id ASC').all(visitorId);
        socket.emit('chat_history', history);

        // Notify admins of updated active visitors
        io.to('admins').emit('visitor_list_update', Array.from(activeVisitors.keys()));
    });

    // Admin Authentication
    socket.on('admin_login', ({ password }) => {
        if (password === ADMIN_PASSWORD) {
            socket.isAdmin = true;
            socket.join('admins');
            socket.emit('admin_auth_success');
            socket.emit('visitor_list_update', Array.from(activeVisitors.keys()));
        } else {
            socket.emit('admin_auth_failure', 'Invalid password');
        }
    });

    socket.on('admin_get_history', ({ visitorId }) => {
        if (!socket.isAdmin) return;
        const history = db.prepare('SELECT * FROM messages WHERE visitor_id = ? ORDER BY id ASC').all(visitorId);
        socket.emit('admin_chat_history', { visitorId, history });
    });

    // 4. Instant Message Delivery: Save to SQLite immediately and dispatch
    socket.on('send_message', ({ visitorId, text, sender }) => {
        if (!visitorId || !text) return;

        // Persist message directly to database
        const stmt = db.prepare('INSERT INTO messages (visitor_id, sender, text) VALUES (?, ?, ?)');
        const result = stmt.run(visitorId, sender, text);

        const msgObj = {
            id: result.lastInsertRowid,
            visitor_id: visitorId,
            sender: sender,
            text: text,
            timestamp: new Date().toISOString()
        };

        // Broadcast to visitor and admin panels instantly
        io.to(visitorId).emit('new_message', msgObj);
        io.to('admins').emit('new_message', msgObj);
    });

    // WebRTC Signaling Relay
    socket.on('signal', (data) => {
        if (data.targetVisitorId) {
            const targetSocketId = activeVisitors.get(data.targetVisitorId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('signal', { sender: 'admin', signal: data.signal });
            }
        } else if (socket.visitorId) {
            io.to('admins').emit('signal', { visitorId: socket.visitorId, signal: data.signal });
        }
    });

    socket.on('end_call', (data) => {
        if (data && data.targetVisitorId) {
            const targetSocketId = activeVisitors.get(data.targetVisitorId);
            if (targetSocketId) io.to(targetSocketId).emit('end_call');
        } else if (socket.visitorId) {
            io.to('admins').emit('end_call', { visitorId: socket.visitorId });
        }
    });

    socket.on('disconnect', () => {
        if (socket.visitorId) {
            activeVisitors.delete(socket.visitorId);
            io.to('admins').emit('visitor_list_update', Array.from(activeVisitors.keys()));
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
