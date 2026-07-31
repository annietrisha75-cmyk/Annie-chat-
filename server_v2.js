const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Setup persistent SQLite DB
const db = new Database('chat_history.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS visitors (
    email TEXT PRIMARY KEY,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Online tracking
const activeUsers = new Map(); // socketId -> email
const visitorSockets = new Map(); // email -> socketId

io.on('connection', (socket) => {
  
  // Register identity (admin or visitor)
  socket.on('register', ({ role, email }) => {
    socket.role = role;
    socket.email = email;
    activeUsers.set(socket.id, email);
    
    if (role === 'visitor') {
      visitorSockets.set(email, socket.id);
      db.prepare(`INSERT INTO visitors (email) VALUES (?) ON CONFLICT(email) DO UPDATE SET last_seen=CURRENT_TIMESTAMP`).run(email);
      io.emit('visitor_list_update', Array.from(visitorSockets.keys()));
    } else if (role === 'admin') {
      // Send visitor list & chat histories to admin
      const visitors = db.prepare(`SELECT email FROM visitors ORDER BY last_seen DESC`).all();
      socket.emit('visitor_list', visitors.map(v => ({ email: v.email, online: visitorSockets.has(v.email) })));
    }
  });

  // Fetch full message history between admin and visitor
  socket.on('get_history', ({ visitorEmail }) => {
    const history = db.prepare(`
      SELECT * FROM messages 
      WHERE (sender = ? AND receiver = 'admin') OR (sender = 'admin' AND receiver = ?)
      ORDER BY timestamp ASC
    `).all(visitorEmail, visitorEmail);
    socket.emit('history_data', { visitorEmail, history });
  });

  // Handle messaging (Store & Forward)
  socket.on('send_message', ({ sender, receiver, text }) => {
    const stmt = db.prepare(`INSERT INTO messages (sender, receiver, text) VALUES (?, ?, ?)`);
    const info = stmt.run(sender, receiver, text);
    const msgObj = { id: info.lastInsertRowid, sender, receiver, text, timestamp: new Date().toISOString() };

    // Relay to recipient if online
    if (receiver === 'admin') {
      io.emit('receive_message', msgObj);
    } else {
      const targetSocketId = visitorSockets.get(receiver);
      if (targetSocketId) {
        io.to(targetSocketId).emit('receive_message', msgObj);
      }
    }
    // Echo back to sender confirmation
    socket.emit('message_sent', msgObj);
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', (data) => {
    const targetSocketId = visitorSockets.get(data.targetEmail);
    if (targetSocketId) io.to(targetSocketId).emit('webrtc_offer', data);
  });

  socket.on('webrtc_answer', (data) => {
    io.emit('webrtc_answer', data);
  });

  socket.on('webrtc_ice_candidate', (data) => {
    if (data.targetEmail) {
      const targetSocketId = visitorSockets.get(data.targetEmail);
      if (targetSocketId) io.to(targetSocketId).emit('webrtc_ice_candidate', data);
    } else {
      io.emit('webrtc_ice_candidate', data);
    }
  });

  socket.on('end_call', (data) => {
    io.emit('call_ended', data);
  });

  socket.on('disconnect', () => {
    if (socket.email && socket.role === 'visitor') {
      visitorSockets.delete(socket.email);
      io.emit('visitor_list_update', Array.from(visitorSockets.keys()));
    }
    activeUsers.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
