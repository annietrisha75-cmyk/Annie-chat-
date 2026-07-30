const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------
// DATABASE CONNECTION (MongoDB for Permanent Storage)
// ---------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/annie_chat';

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

const messageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['user', 'owner'], required: true },
    text: { type: String, default: '' },
    media: { type: String, default: null },
    timestamp: { type: Date, default: Date.now }
});

const threadSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    messages: [messageSchema],
    lastUpdated: { type: Date, default: Date.now }
});

const Thread = mongoose.model('Thread', threadSchema);

// ---------------------------------------------------------
// BACKGROUND AUTOMATION (Sends reminder simulation every 5 hours)
// ---------------------------------------------------------
async function triggerFiveHourReminders() {
    try {
        const threads = await Thread.find({});
        threads.forEach(thread => {
            console.log(`[AI Romantic Dispatcher] Automated 5-hour reminder link sent to: ${thread.email} -> Come back to your private chat with Annie: https://annie-chat.onrender.com`);
        });
    } catch (err) {
        console.error('Error in 5-hour reminder system:', err);
    }
}
setInterval(triggerFiveHourReminders, 5 * 60 * 60 * 1000);


// ---------------------------------------------------------
// API ENDPOINTS
// ---------------------------------------------------------

app.get('/api/admin/threads', async (req, res) => {
    try {
        const threads = await Thread.find({}).sort({ lastUpdated: -1 });
        const formattedThreads = threads.map(t => {
            const lastMsg = t.messages.length > 0 ? t.messages[t.messages.length - 1] : null;
            return {
                email: t.email,
                lastMessage: lastMsg ? lastMsg.text || '[Attachment]' : '',
                lastUpdated: lastMsg ? lastMsg.timestamp : t.lastUpdated
            };
        });
        res.json(formattedThreads);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch threads' });
    }
});

app.get('/api/admin/messages', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.json([]);
    try {
        const thread = await Thread.findOne({ email });
        res.json(thread ? thread.messages : []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.post('/api/admin/reply', async (req, res) => {
    const { email, text, media } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const newMessage = {
            sender: 'owner',
            text: text || '',
            media: media || null,
            timestamp: new Date()
        };

        let thread = await Thread.findOne({ email });
        if (!thread) {
            thread = new Thread({ email, messages: [newMessage], lastUpdated: new Date() });
        } else {
            thread.messages.push(newMessage);
            thread.lastUpdated = new Date();
        }
        await thread.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save reply' });
    }
});

app.post('/api/chat/message', async (req, res) => {
    const { email, text, media } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const newMessage = {
            sender: 'user',
            text: text || '',
            media: media || null,
            timestamp: new Date()
        };

        let thread = await Thread.findOne({ email });
        if (!thread) {
            thread = new Thread({ email, messages: [newMessage], lastUpdated: new Date() });
        } else {
            thread.messages.push(newMessage);
            thread.lastUpdated = new Date();
        }
        await thread.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save message' });
    }
});

app.get('/api/chat/messages', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.json([]);
    try {
        const thread = await Thread.findOne({ email });
        res.json(thread ? thread.messages : []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.delete('/api/admin/thread', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
        const result = await Thread.findOneAndDelete({ email });
        if (result) {
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Thread not found' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete thread' });
    }
});


// ---------------------------------------------------------
// FRONT-END: CLIENT CHAT (Romantic Theme + Permanent Memory + Auto Browser Deep-Link)
// ---------------------------------------------------------
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eternally Yours - Private Sanctuary</title>
    <style>
        :root {
            --bg-base: #0f0a0e;
            --bg-surface: #1b1219;
            --border-color: #3b2332;
            --accent-gold: #e2c068;
            --accent-rose: #d977a0;
            --text-main: #fcf6fa;
            --text-muted: #c4adb9;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-base); color: var(--text-main); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        
        header { background: var(--bg-surface); padding: 12px 18px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
        .logo-area { display: flex; align-items: center; gap: 10px; }
        .logo-avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid var(--accent-gold); }
        .logo { font-weight: 700; color: var(--accent-gold); letter-spacing: 1px; text-transform: uppercase; font-size: 0.85rem; }
        
        .header-btns { display: flex; gap: 6px; }
        .action-chip { background: rgba(226,192,104,0.1); border: 1px solid var(--accent-gold); color: var(--accent-gold); padding: 6px 10px; border-radius: 6px; font-size: 0.7rem; cursor: pointer; font-weight: 600; }

        #setupModal { position: fixed; inset: 0; background: rgba(15,10,14,0.95); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 20px; overflow-y: auto; }
        .modal-card { background: var(--bg-surface); padding: 25px; border-radius: 16px; border: 1px solid var(--border-color); width: 100%; max-width: 380px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); text-align: center; margin: auto; }
        .modal-art { width: 100%; height: 130px; border-radius: 10px; object-fit: cover; margin-bottom: 14px; border: 1px solid var(--border-color); }
        .modal-card h2 { color: var(--accent-gold); font-size: 1.2rem; margin-bottom: 6px; font-family: serif; }
        .modal-card p { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 16px; line-height: 1.4; }
        .modal-card input { width: 100%; background: var(--bg-base); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px; color: var(--text-main); font-size: 0.95rem; margin-bottom: 12px; outline: none; text-align: center; }
        .modal-card button { width: 100%; background: linear-gradient(135deg, var(--accent-gold), var(--accent-rose)); color: #000; border: none; padding: 14px; border-radius: 8px; font-weight: 700; cursor: pointer; }

        .chat-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background-image: radial-gradient(circle at 50% 50%, #170e15 0%, #0f0a0e 100%); }
        .message { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; line-height: 1.4; word-break: break-word; }
        .message.user { background: linear-gradient(135deg, var(--accent-gold), var(--accent-rose)); color: #000; align-self: flex-end; font-weight: 500; }
        .message.owner { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); align-self: flex-start; }
        .msg-media { max-width: 100%; border-radius: 6px; margin-top: 6px; max-height: 180px; display: block; cursor: pointer; }

        .input-box { background: var(--bg-surface); padding: 14px; border-top: 1px solid var(--border-color); display: flex; gap: 10px; align-items: center; }
        .input-box input[type="text"] { flex: 1; background: var(--bg-base); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; color: var(--text-main); outline: none; font-size: 0.9rem; }
        .input-box button { background: var(--accent-gold); color: #000; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .file-btn { background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-muted); padding: 10px; border-radius: 8px; cursor: pointer; }
        #clientFile { display: none; }
    </style>
</head>
<body>

    <div id="setupModal">
        <div class="modal-card">
            <img src="https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80" class="modal-art" alt="Romantic Art">
            <h2>Our Private Haven</h2>
            <p>Enter your email once. Your device will securely lock it in forever so you never have to sign in again.</p>
            <input type="email" id="userEmailInput" placeholder="name@example.com" autocomplete="email">
            <button onclick="lockAndStartSession()">Enter Forever Sanctuary</button>
        </div>
    </div>

    <header>
        <div class="logo-area">
            <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80" class="logo-avatar" alt="Annie">
            <div class="logo">Annie & You</div>
        </div>
        <div class="header-btns">
            <button class="action-chip" onclick="triggerPinToHome()">📌 Pin App</button>
            <button class="action-chip" onclick="forceOpenBestBrowser()">🌐 Open Browser</button>
        </div>
    </header>

    <div class="chat-container" id="clientMessages"></div>

    <div class="input-box">
        <input type="file" id="clientFile" accept="image/*" onchange="handleClientFile(event)">
        <button class="file-btn" onclick="document.getElementById('clientFile').click()">📎</button>
        <input type="text" id="clientInput" placeholder="Whisper something sweet..." autocomplete="off">
        <button onclick="sendClientMessage()">Send</button>
    </div>

    <script>
        function forceOpenBestBrowser() {
            const url = window.location.href;
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                window.location.href = url;
            } else if (/android/i.test(navigator.userAgent)) {
                window.location.href = \`intent://\${window.location.host}\${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end;\`;
            }
        }

        let myEmail = localStorage.getItem('annie_user_email');
        let selectedMediaBase64 = null;
        let lastRenderedSignature = '';

        if (myEmail) {
            document.getElementById('setupModal').style.display = 'none';
            loadCachedClientMessages();
            initClientPoll();
        } else {
            forceOpenBestBrowser();
        }

        function lockAndStartSession() {
            const val = document.getElementById('userEmailInput').value.trim();
            if (!val || !val.includes('@')) {
                alert('Please enter a valid email address.');
                return;
            }
            localStorage.setItem('annie_user_email', val);
            myEmail = val;
            document.getElementById('setupModal').style.display = 'none';
            loadCachedClientMessages();
            initClientPoll();
        }

        function triggerPinToHome() {
            alert('To pin instantly: tap your browser settings menu (...) and select "Add to Home Screen" or "Install App".');
        }

        function loadCachedClientMessages() {
            if (!myEmail) return;
            const cached = localStorage.getItem('annie_msgs_' + myEmail);
            if (cached) {
                try {
                    renderMessages(JSON.parse(cached));
                } catch(e) {}
            }
        }

        function initClientPoll() {
            fetchMessages();
            setInterval(fetchMessages, 3000);
        }

        async function fetchMessages() {
            if (!myEmail) return;
            try {
                const res = await fetch(\`/api/chat/messages?email=\${encodeURIComponent(myEmail)}\`);
                const messages = await res.json();
                
                localStorage.setItem('annie_msgs_' + myEmail, JSON.stringify(messages));
                renderMessages(messages);
            } catch (err) {
                console.error('Error fetching chat history', err);
            }
        }

        function renderMessages(messages) {
            const container = document.getElementById('clientMessages');
            
            const newSignature = JSON.stringify(messages);
            if (newSignature === lastRenderedSignature) return;
            lastRenderedSignature = newSignature;

            const isScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;

            container.innerHTML = '';
            if (messages.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:40px; font-size:0.85rem;">Our love sanctuary is open. Leave a message for me below. ❤️</div>';
                return;
            }

            messages.forEach(m => {
                const div = document.createElement('div');
                div.className = \`message \${m.sender === 'user' ? 'user' : 'owner'}\`;
                let mediaHtml = m.media ? \`<img src="\${m.media}" class="msg-media" onclick="window.open(this.src)">\` : '';
                div.innerHTML = \`<div>\${escapeHTML(m.text)}</div>\${mediaHtml}\`;
                container.appendChild(div);
            });

            if (isScrolledToBottom || container.children.length === messages.length) {
                container.scrollTop = container.scrollHeight;
            }
        }

        function handleClientFile(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                selectedMediaBase64 = evt.target.result;
                alert('Romantic photo attached successfully. Click Send.');
            };
            reader.readAsDataURL(file);
        }

        async function sendClientMessage() {
            const input = document.getElementById('clientInput');
            const text = input.value.trim();
            if ((!text && !selectedMediaBase64) || !myEmail) return;

            const payloadText = text;
            const payloadMedia = selectedMediaBase64;
            input.value = '';
            selectedMediaBase64 = null;

            try {
                await fetch('/api/chat/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: myEmail, text: payloadText, media: payloadMedia })
                });
                fetchMessages();
            } catch (err) {
                console.error('Failed to send message', err);
            }
        }

        document.getElementById('clientInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendClientMessage();
        });

        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
        }
    </script>
</body>
</html>`);
});


// ---------------------------------------------------------
// FRONT-END: ADMIN DASHBOARD (Strict Password: felix123)
// ---------------------------------------------------------
app.get('/admin.html', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Owner Control Center - Felix Secured</title>
    <style>
        :root {
            --bg-base: #070708;
            --bg-surface: #121214;
            --bg-surface-hover: #1c1c1f;
            --border-color: #27272a;
            --accent-gold: #d4af37;
            --accent-gold-glow: rgba(212, 175, 55, 0.15);
            --text-main: #f4f4f5;
            --text-muted: #a1a1aa;
            --danger: #ef4444;
            --success: #22c55e;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-base); color: var(--text-main); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }

        #authOverlay { position: fixed; inset: 0; background: var(--bg-base); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .auth-card { background: var(--bg-surface); padding: 35px; border-radius: 16px; border: 1px solid var(--border-color); width: 340px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
        .auth-card h2 { color: var(--accent-gold); font-size: 1.3rem; margin-bottom: 8px; }
        .auth-card p { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 24px; }
        .auth-card input { width: 100%; background: var(--bg-base); border: 1px solid var(--border-color); padding: 14px; border-radius: 10px; color: var(--text-main); font-size: 1rem; margin-bottom: 16px; outline: none; text-align: center; }
        .auth-card input:focus { border-color: var(--accent-gold); }
        .auth-card button { width: 100%; background: var(--accent-gold); color: #000; border: none; padding: 14px; border-radius: 10px; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
        #authError { color: var(--danger); font-size: 0.8rem; margin-top: 10px; display: none; }

        header { background: var(--bg-surface); padding: 14px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; z-index: 10; height: 60px; }
        .header-left { display: flex; align-items: center; gap: 12px; }
        h1 { margin: 0; font-size: 1rem; letter-spacing: 1.2px; color: var(--accent-gold); text-transform: uppercase; font-weight: 700; }
        .global-status { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-muted); background: var(--bg-base); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-color); }
        .status-dot { width: 7px; height: 7px; background: var(--success); border-radius: 50%; box-shadow: 0 0 8px var(--success); }
        .translator-badge { font-size: 0.75rem; background: var(--accent-gold-glow); color: var(--accent-gold); padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(212, 175, 55, 0.3); font-weight: 500; }

        .main-container { display: flex; flex: 1; overflow: hidden; position: relative; }

        .sidebar { width: 360px; border-right: 1px solid var(--border-color); background: var(--bg-surface); display: flex; flex-direction: column; z-index: 5; transition: transform 0.3s ease; }
        .search-bar-container { padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); display: flex; gap: 8px; }
        .search-bar { width: 100%; background: var(--bg-base); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; color: var(--text-main); font-size: 0.85rem; outline: none; }
        .search-bar:focus { border-color: var(--accent-gold); }

        .threads-list { flex: 1; overflow-y: auto; }
        .thread-wrapper { position: relative; overflow: hidden; border-bottom: 1px solid var(--border-color); }
        .thread-item { padding: 16px; cursor: pointer; background: var(--bg-surface); position: relative; z-index: 2; width: 100%; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; }
        .thread-item:hover { background: var(--bg-surface-hover); }
        .thread-item.active { background: var(--bg-surface-hover); border-left: 3px solid var(--accent-gold); }
        .thread-header-row { display: flex; justify-content: space-between; align-items: center; }
        .thread-email { font-weight: 600; font-size: 0.9rem; color: #fff; }
        .thread-time { font-size: 0.7rem; color: var(--text-muted); }
        .thread-preview-row { display: flex; justify-content: space-between; align-items: center; }
        .thread-preview { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
        .delete-action { position: absolute; right: 0; top: 0; bottom: 0; width: 90px; background: var(--danger); color: white; display: flex; justify-content: center; align-items: center; font-weight: 600; font-size: 0.85rem; cursor: pointer; z-index: 1; }

        .chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg-base); position: relative; }
        .back-btn-container { display: none; padding: 10px 16px; background: var(--bg-surface); border-bottom: 1px solid var(--border-color); }
        .back-btn { background: var(--bg-base); color: var(--accent-gold); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; font-weight: 600; }

        .chat-header { padding: 14px 20px; background: var(--bg-surface); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--text-muted); }
        .chat-header span { color: var(--accent-gold); font-weight: 600; }
        .chat-actions { display: flex; gap: 8px; }
        .icon-btn { background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-muted); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
        .icon-btn:hover { color: var(--text-main); border-color: var(--accent-gold); }

        .messages-container { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .message { max-width: 75%; padding: 12px 16px; border-radius: 14px; font-size: 0.9rem; line-height: 1.45; position: relative; word-break: break-word; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        .message.owner { background: var(--accent-gold); color: #000; align-self: flex-end; border-bottom-right-radius: 4px; }
        .message.user { background: var(--bg-surface); color: var(--text-main); align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid var(--border-color); }
        .translation-tag { font-size: 0.7rem; opacity: 0.85; margin-bottom: 6px; display: block; border-bottom: 1px dashed rgba(0,0,0,0.15); padding-bottom: 3px; font-weight: 600; }
        .message.user .translation-tag { border-bottom: 1px dashed rgba(255,255,255,0.15); color: var(--accent-gold); }
        
        .message-content { position: relative; padding-right: 20px; }
        .msg-status { font-size: 0.65rem; position: absolute; right: 0; bottom: 0; color: #444; font-weight: 700; }
        .message.owner .msg-status { color: #333; }
        
        .message-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.65rem; opacity: 0.7; }
        .msg-actions-hover { display: none; cursor: pointer; font-size: 0.75rem; padding: 0 4px; }
        .message:hover .msg-actions-hover { display: inline-block; }

        .msg-media { max-width: 100%; border-radius: 8px; margin-top: 6px; max-height: 200px; display: block; cursor: pointer; }

        .input-area { padding: 16px 20px; background: var(--bg-surface); border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px; }
        .input-row { display: flex; gap: 12px; align-items: center; width: 100%; }
        .input-wrapper { flex: 1; position: relative; display: flex; align-items: center; }
        input[type="text"] { width: 100%; background: var(--bg-base); border: 1px solid var(--border-color); padding: 12px 18px; border-radius: 10px; color: var(--text-main); font-size: 0.95rem; outline: none; }
        input[type="text"]:focus { border-color: var(--accent-gold); }
        
        .action-icon-btn { background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-muted); width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.1rem; flex-shrink: 0; transition: all 0.2s; }
        .action-icon-btn:hover { color: var(--accent-gold); border-color: var(--accent-gold); }
        button.send-btn { background: var(--accent-gold); color: #000; border: none; padding: 12px 22px; border-radius: 10px; font-weight: 700; cursor: pointer; }

        #mediaInput { display: none; }
        .preview-tray { display: none; background: var(--bg-base); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 8px; align-items: center; justify-content: space-between; font-size: 0.8rem; }
        .preview-tray span { color: var(--accent-gold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px; }
        .preview-tray button { background: none; border: none; color: var(--danger); cursor: pointer; font-weight: 600; }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); gap: 10px; text-align: center; padding: 20px; }

        @media (max-width: 768px) {
            .sidebar { width: 100%; height: 100%; position: absolute; inset: 0; z-index: 5; transition: transform 0.3s ease; }
            .sidebar.hidden { transform: translateX(-100%); }
            .chat-area { width: 100%; height: 100%; position: absolute; inset: 0; z-index: 4; }
            .chat-area.hidden { display: none; }
            .back-btn-container { display: block; }
        }
    </style>
</head>
<body>

    <div id="authOverlay">
        <div class="auth-card">
            <h2>Owner Control Center</h2>
            <p>Enter Master Password</p>
            <input type="password" id="adminPassword" placeholder="Password">
            <button onclick="verifyPassword()">Authenticate</button>
            <div id="authError">Incorrect password. Access denied.</div>
        </div>
    </div>

    <header>
        <div class="header-left">
            <h1>Control Center</h1>
            <div class="global-status">
                <div class="status-dot"></div>
                <span>Online</span>
            </div>
        </div>
        <div class="translator-badge">🌐 Auto-Translator Active</div>
    </header>

    <div class="main-container">
        <div class="sidebar" id="sidebar">
            <div class="search-bar-container">
                <input type="text" class="search-bar" id="searchThreads" placeholder="Search threads by email..." oninput="filterThreads()">
            </div>
            <div class="threads-list" id="threadsList">
                <div class="empty-state"><span>Loading secure sessions...</span></div>
            </div>
        </div>

        <div class="chat-area hidden" id="chatArea">
            <div class="back-btn-container">
                <button class="back-btn" onclick="showThreadsList()">← Back to Inbox</button>
            </div>
            <div class="chat-header">
                <div>Active Target: <span id="activeThreadEmail">None selected</span></div>
                <div class="chat-actions">
                    <button class="icon-btn" onclick="exportChatLogs()" title="Export Conversation">Export JSON</button>
                    <button class="icon-btn" onclick="clearActiveThreadHistory()" title="Clear Logs">Clear</button>
                </div>
            </div>
            
            <div class="messages-container" id="messagesContainer">
                <div class="empty-state"><span>Select a user session from the sidebar</span></div>
            </div>

            <div class="input-area">
                <div class="preview-tray" id="mediaPreviewTray">
                    <span id="fileNameDisplay">Attached File</span>
                    <button onclick="clearAttachment()">Remove</button>
                </div>
                <div class="input-row">
                    <input type="file" id="mediaInput" accept="image/*" onchange="handleFileSelect(event)">
                    <button class="action-icon-btn" onclick="document.getElementById('mediaInput').click()" title="Attach Image">📎</button>
                    <div class="input-wrapper">
                        <input type="text" id="replyInput" placeholder="Reply as owner..." autocomplete="off">
                    </div>
                    <button class="action-icon-btn" onclick="insertQuickReply()" title="Quick Response Templates">⚡</button>
                    <button class="send-btn" onclick="sendReply()">Send</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentEmail = null;
        let lastMessageCount = 0;
        let cachedThreads = [];
        let selectedFileBase64 = null;
        let selectedFileName = null;

        function verifyPassword() {
            const pass = document.getElementById('adminPassword').value;
            const errorDiv = document.getElementById('authError');
            
            if (pass === 'felix123') {
                errorDiv.style.display = 'none';
                document.getElementById('authOverlay').style.display = 'none';
                initDashboard();
            } else {
                errorDiv.style.display = 'block';
            }
        }

        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyPassword();
        });

        function initDashboard() {
            loadThreads();
            setInterval(loadThreads, 4000);
            setInterval(() => loadMessages(false), 3000);
        }

        async function loadThreads() {
            try {
                const res = await fetch('/api/admin/threads');
                const threads = await res.json();
                cachedThreads = threads;
                renderThreads(threads);
            } catch (err) {
                console.error('Failed to sync threads:', err);
            }
        }

        function renderThreads(threads) {
            const list = document.getElementById('threadsList');
            const searchTerm = document.getElementById('searchThreads').value.toLowerCase();
            const filtered = threads.filter(t => t.email.toLowerCase().includes(searchTerm));
            
            if (filtered.length === 0) {
                list.innerHTML = '<div class="empty-state"><span style="color:var(--text-muted); font-size:0.85rem;">No conversations found</span></div>';
                return;
            }

            const scrollPos = list.scrollTop;
            list.innerHTML = '';

            filtered.forEach(t => {
                const wrapper = document.createElement('div');
                wrapper.className = 'thread-wrapper';

                const deleteDiv = document.createElement('div');
                deleteDiv.className = 'delete-action';
                deleteDiv.textContent = 'Delete';
                deleteDiv.onclick = (e) => {
                    e.stopPropagation();
                    deleteThread(t.email);
                };

                const div = document.createElement('div');
                div.className = \`thread-item \${currentEmail === t.email ? 'active' : ''}\`;
                div.innerHTML = \`
                    <div class="thread-header-row">
                        <span class="thread-email">\${t.email}</span>
                        <span class="thread-time">\${formatTime(t.lastUpdated)}</span>
                    </div>
                    <div class="thread-preview-row">
                        <span class="thread-preview">\${t.lastMessage || 'No recent activity'}</span>
                    </div>
                \`;
                div.onclick = () => selectThread(t.email);

                let startX = 0;
                div.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, {passive: true});
                div.addEventListener('touchmove', (e) => {
                    let diff = startX - e.touches[0].clientX;
                    if (diff > 40) {
                        div.style.transform = 'translateX(-90px)';
                        div.style.transition = 'transform 0.2s ease';
                    } else if (diff < -10) {
                        div.style.transform = 'translateX(0)';
                    }
                }, {passive: true});

                wrapper.appendChild(deleteDiv);
                wrapper.appendChild(div);
                list.appendChild(wrapper);
            });
            list.scrollTop = scrollPos;
        }

        function filterThreads() {
            renderThreads(cachedThreads);
        }

        function formatTime(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function selectThread(email) {
            currentEmail = email;
            document.getElementById('activeThreadEmail').textContent = email;
            lastMessageCount = 0;
            loadMessages(true);
            renderThreads(cachedThreads);
            
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.add('hidden');
                document.getElementById('chatArea').classList.remove('hidden');
            }
        }

        function showThreadsList() {
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('chatArea').classList.add('hidden');
            currentEmail = null;
        }

        async function deleteThread(email) {
            if (!confirm(\`Permanently terminate thread with \${email}?\`)) return;
            try {
                const res = await fetch(\`/api/admin/thread?email=\${encodeURIComponent(email)}\`, { method: 'DELETE' });
                if (res.ok) {
                    if (currentEmail === email) showThreadsList();
                    loadThreads();
                }
            } catch (err) {
                console.error('Failed to purge thread:', err);
            }
        }

        async function clearActiveThreadHistory() {
            if (!currentEmail) return;
            if (!confirm('Clear all logs for active session?')) return;
            await deleteThread(currentEmail);
        }

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(uploadEvent) {
                selectedFileBase64 = uploadEvent.target.result;
                selectedFileName = file.name;
                document.getElementById('fileNameDisplay').textContent = file.name;
                document.getElementById('mediaPreviewTray').style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }

        function clearAttachment() {
            selectedFileBase64 = null;
            selectedFileName = null;
            document.getElementById('mediaInput').value = '';
            document.getElementById('mediaPreviewTray').style.display = 'none';
        }

        function insertQuickReply() {
            const templates = [
                "Hello, my love! I've been thinking about you.",
                "Please hold on while I check this for you, my dearest.",
                "Your message brought a smile to my face.",
                "I am always right here waiting for your return."
            ];
            const choice = prompt("Select Quick Reply Template (1-4):\\n1. Thinking of you\\n2. Hold on dearest\\n3. Smile on face\\n4. Always right here");
            const idx = parseInt(choice) - 1;
            if (templates[idx]) {
                document.getElementById('replyInput').value = templates[idx];
            }
        }

        async function loadMessages(forceScroll = false) {
            if (!currentEmail) return;
            try {
                const res = await fetch(\`/api/admin/messages?email=\${encodeURIComponent(currentEmail)}\`);
                const messages = await res.json();
                const container = document.getElementById('messagesContainer');
                
                if (messages.length === lastMessageCount && !forceScroll) return;

                lastMessageCount = messages.length;
                container.innerHTML = '';
                
                if (messages.length === 0) {
                    container.innerHTML = '<div class="empty-state"><span style="color:var(--text-muted);">No logs recorded yet.</span></div>';
                    return;
                }

                messages.forEach((m) => {
                    const msgDiv = document.createElement('div');
                    msgDiv.className = \`message \${m.sender}\`;
                    
                    let translationLabel = m.sender === 'user' 
                        ? \`<span class="translation-tag">🔵 Auto-Translated to English</span>\` 
                        : \`<span class="translation-tag">🟢 Auto-Translated to User Language</span>\`;

                    let mediaHtml = m.media ? \`<img src="\${m.media}" class="msg-media" onclick="window.open(this.src)">\` : '';

                    msgDiv.innerHTML = \`
                        \${translationLabel}
                        <div class="message-content">
                            <div>\${escapeHTML(m.text)}</div>
                            \${mediaHtml}
                            <span class="msg-status">✓✓</span>
                        </div>
                        <div class="message-footer">
                            <span class="msg-actions-hover" onclick="copyMessageText('\${encodeURIComponent(m.text)}')">Copy</span>
                            <span>\${formatTime(m.timestamp)}</span>
                        </div>
                    \`;
                    container.appendChild(msgDiv);
                });
                container.scrollTop = container.scrollHeight;
            } catch (err) {
                console.error('Failed to load message stack:', err);
            }
        }

        async function sendReply() {
            const input = document.getElementById('replyInput');
            const text = input.value.trim();
            if ((!text && !selectedFileBase64) || !currentEmail) return;

            const payloadText = text;
            const payloadMedia = selectedFileBase64;

            input.value = '';
            clearAttachment();

            try {
                const res = await fetch('/api/admin/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentEmail, text: payloadText, media: payloadMedia })
                });
                if (res.ok) loadMessages(true);
            } catch (err) {
                console.error('Transmission failure:', err);
            }
        }

        function copyMessageText(encodedText) {
            navigator.clipboard.writeText(decodeURIComponent(encodedText));
            alert('Message copied to clipboard');
        }

        function exportChatLogs() {
            if (!currentEmail) return;
            fetch(\`/api/admin/messages?email=\${encodeURIComponent(currentEmail)}\`)
                .then(res => res.json())
                .then(data => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", \`chat_export_\${currentEmail}.json\`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                });
        }

        document.getElementById('replyInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendReply();
        });

        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>'"]/g, 
                tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
            );
        }
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Production server running on port ${PORT}`);
});
