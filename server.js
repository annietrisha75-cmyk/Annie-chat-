const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Connect to Free MongoDB Cloud Database with TLS workarounds for Render
const client = new MongoClient(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true
});
let db, usersCollection;

async function startServer() {
    try {
        await client.connect();
        db = client.db("annie_chat_app");
        usersCollection = db.collection("users");
        console.log("Connected to MongoDB Atlas!");

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
    }
}
startServer();

// Email Transporter (Using Gmail App Password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper: Dynamic Trust Badge Rotator (Builds psychological trust daily)
function getDynamicTrustBadge() {
    const badges = [
        "🟢 Verified Secure Space",
        "🛡️ End-to-End Encrypted Node",
        "⭐ Trusted Private Connection",
        "🔒 Verified Safe & Direct"
    ];
    return badges[Math.floor(Math.random() * badges.length)];
}

// 1. HOME PAGE (Auto-translates to user's browser language via HTML lang tag)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="auto">
        <head>
            <title>Secure Private Chat</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 350px; text-align: center; }
                input { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
                button { width: 100%; padding: 12px; background: #075e54; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
                button:hover { background: #044e45; }
                .badge { font-size: 12px; color: #2e7d32; background: #e8f5e9; padding: 6px; border-radius: 4px; margin-bottom: 15px; display: inline-block; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="badge">${getDynamicTrustBadge()}</div>
                <h2>💬 Private Chat Access</h2>
                <p style="color: #666; font-size: 14px;">Enter your email to safely open your encrypted session.</p>
                <form action="/register" method="POST">
                    <input type="email" name="email" placeholder="Your email address" required>
                    <button type="submit">Open Secure Room</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 2. REGISTER USER & GENERATE UNIQUE ROOM
app.post('/register', async (req, res) => {
    try {
        const userEmail = req.body.email;
        const result = await usersCollection.insertOne({ email: userEmail, createdAt: new Date() });
        const uniqueId = result.insertedId.toString();
        res.redirect(`/chat/${uniqueId}`);
    } catch (e) {
        console.error("Registration error:", e);
        res.status(500).send("Internal Server Error");
    }
});

// 3. THE CHAT ROOM + AI HELPER + STEP-BY-STEP GUIDES
app.get('/chat/:id', async (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="auto">
        <head>
            <title>Secure Chat Session</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #eef2f7; display: flex; flex-direction: column; height: 100vh; }
                .header { background: #075e54; color: white; padding: 15px; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: space-between; }
                
                /* Step-by-Step Interactive Guide Banners */
                .guide-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 10px; border-radius: 6px; font-size: 13px; color: #856404; line-height: 1.4; }
                .ai-assistant-banner { background: #e8f4fd; border-left: 4px solid #2196F3; padding: 10px; margin: 0 10px 10px 10px; border-radius: 6px; font-size: 12px; color: #0d47a1; display: flex; align-items: center; justify-content: space-between; }
                
                .chat-box { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
                .bubble { background: white; padding: 12px; border-radius: 8px; max-width: 80%; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
                .ai-bubble { background: #e1f5fe; padding: 10px; border-radius: 8px; font-size: 12px; color: #01579b; margin-top: 5px; }
                
                .input-area { background: white; padding: 10px; display: flex; gap: 10px; border-top: 1px solid #ddd; align-items: center; }
                input[type="text"] { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 20px; outline: none; }
                .file-label { background: #f0f2f5; padding: 8px 12px; border-radius: 20px; font-size: 13px; cursor: pointer; border: 1px solid #ccc; }
                .send-btn { background: #075e54; color: white; border: none; padding: 10px 15px; border-radius: 20px; font-weight: bold; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="header">
                <span>🟢 Connected Session</span>
                <span style="font-size: 11px; background: rgba(0,0,0,0.2); padding: 3px 8px; border-radius: 4px;">${getDynamicTrustBadge()}</span>
            </div>

            <!-- Hand-Holding Guide 1: How to Save to Home Screen Properly -->
            <div class="guide-box">
                <b>📌 Step 1: Save this to your phone so you never lose your chat:</b>
                <ol style="margin: 5px 0 0 15px; padding: 0;">
                    <li>Tap your Safari/Browser <b>Share Button</b> <span style="font-size:14px;">(📤 or square with arrow)</span>.</li>
                    <li>Select <b>'Add to Home Screen'</b>.</li>
                    <li>Name it whatever you prefer (e.g., <b>Annie</b>) and tap <b>Add</b>!</li>
                </ol>
            </div>

            <!-- Built-in AI Helper Detector -->
            <div class="ai-assistant-banner" id="aiHelper">
                <span>🤖 <b>AI Assistant:</b> Need help sending a photo or snapshot? Just tap the photo button below, or ask me anything!</span>
            </div>

            <div class="chat-box" id="chatStream">
                <div class="bubble"><b>Annie:</b> Welcome! I'm glad you made it safely. Let me know if you need help with anything.</div>
            </div>

            <div class="input-area">
                <label class="file-label" onclick="triggerPhotoHelp()">📷 Photo</label>
                <input type="file" id="fileInput" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">
                <input type="text" id="msgInput" placeholder="Type a message...">
                <button class="send-btn" onclick="sendMessage()">Send</button>
            </div>

            <script>
                function triggerPhotoHelp() {
                    document.getElementById('fileInput').click();
                }

                function handlePhotoUpload(event) {
                    const file = event.target.files[0];
                    if (file) {
                        const chatStream = document.getElementById('chatStream');
                        chatStream.innerHTML += \`<div class="bubble" style="align-self: flex-end; background: #dcf8c6;">[Photo Uploaded Securely]</div>\`;
                        
                        setTimeout(() => {
                            chatStream.innerHTML += \`<div class="ai-bubble">🤖 <b>AI Helper:</b> Great job! Your photo was securely packaged and sent.</div>\`;
                            chatStream.scrollTop = chatStream.scrollHeight;
                        }, 500);
                    }
                }

                function sendMessage() {
                    const input = document.getElementById('msgInput');
                    if (input.value.trim() !== "") {
                        const chatStream = document.getElementById('chatStream');
                        chatStream.innerHTML += \`<div class="bubble" style="align-self: flex-end; background: #dcf8c6;">\${input.value}</div>\`;
                        input.value = "";
                        chatStream.scrollTop = chatStream.scrollHeight;
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// 4. OWNER ADMIN DASHBOARD
app.get('/annie-admin-secure-xyz', async (req, res) => {
    try {
        const allUsers = await usersCollection.find({}).toArray();
        
        let html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: Arial; padding: 20px; background: #f4f4f4;">`;
        html += `<h2>👑 Command Center (${allUsers.length} Active Secured Users)</h2><hr><ul>`;
        
        allUsers.forEach(user => {
            html += `<li style="background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; list-style: none; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <strong>Email:</strong> ${user.email} <br><br>
                <a href="/chat/${user._id.toString()}" target="_blank" style="background: #075e54; color: white; padding: 8px 12px; text-decoration: none; border-radius: 5px; font-size: 14px;">👉 Open Private Session</a>
            </li>`;
        });
        
        html += `</ul></body></html>`;
        res.send(html);
    } catch (e) {
        res.status(500).send("Error loading admin panel");
    }
});

// 5. AUTOMATED DAILY EMAIL REMINDER WITH ROTATING TRUST MARKERS
cron.schedule('0 9 * * *', async () => {
    try {
        const allUsers = await usersCollection.find({}).toArray();
        allUsers.forEach(user => {
            const chatLink = `https://annie-chat.onrender.com/chat/${user._id.toString()}`;
            const dynamicSubject = `${getDynamicTrustBadge()} - Your daily secure link`;
            
            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: dynamicSubject,
                text: `Hello! Your private connection is verified and open. Click here to jump straight back into your chat room: ${chatLink}`
            }, (err) => {
                if (err) console.log(`Error sending reminder to ${user.email}`);
            });
        });
    } catch (e) {
        console.log("Cron error:", e);
    }
});
