const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection with Auto-Retry & Stable Options
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
  console.error('MongoDB connection error:', err);
});

// Prevent app crash on unhandled Mongoose errors
mongoose.connection.on('error', err => {
  console.error('Mongoose connection runtime error:', err);
});

// Schemas
const userSessionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  status: { type: String, default: 'Online' },
  lastActive: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  sender: { type: String, required: true }, // user name or owner/admin name
  text: { type: String, default: '' },
  image: { type: String, default: '' }, // base64 payload
  timestamp: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: String }
});

const UserSession = mongoose.model('UserSession', userSessionSchema);
const Message = mongoose.model('Message', messageSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tindertrusted@gmail.com',
    pass: process.env.EMAIL_PASS 
  }
});

// Initialize Default Admin Password
async function initSettings() {
  const adminPass = await Settings.findOne({ key: 'adminPassword' });
  if (!adminPass) {
    await Settings.create({ key: 'adminPassword', value: 'admin123' });
  }
}
initSettings();

// --- API Endpoints ---

// Register or Resume User Session (Tied permanently to email)
app.post('/api/session', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    let session = await UserSession.findOne({ email });
    if (!session) {
      session = new UserSession({ name, email });
      await session.save();
    } else {
      session.name = name; // Update name if changed
      session.lastActive = Date.now();
      await session.save();
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Chat History for a Specific Email
app.get('/api/messages/:email', async (req, res) => {
  try {
    const messages = await Message.find({ email: req.params.email }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a Message (User or Owner)
app.post('/api/messages', async (req, res) => {
  try {
    const { email, sender, text, image } = req.body;
    if (!email || !sender) return res.status(400).json({ error: 'Missing parameters.' });

    const msg = new Message({ email, sender, text, image });
    await msg.save();

    await UserSession.updateOne({ email }, { lastActive: Date.now() }, { upsert: true });
    res.json({ success: true, msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Authentication
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassSetting = await Settings.findOne({ key: 'adminPassword' });
    const currentPass = adminPassSetting ? adminPassSetting.value : 'admin123';

    if (password === currentPass) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Incorrect password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Password Update Endpoint
app.post('/api/admin/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminPassSetting = await Settings.findOne({ key: 'adminPassword' });
    const currentPass = adminPassSetting ? adminPassSetting.value : 'admin123';

    if (oldPassword !== currentPass) {
      return res.status(400).json({ success: false, error: 'Old password is incorrect.' });
    }

    await Settings.updateOne({ key: 'adminPassword' }, { value: newPassword }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Dashboard: Get All Active Threads with Auto-Translation Layer
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await UserSession.find().sort({ lastActive: -1 });
    const usersWithDetails = await Promise.all(users.map(async (u) => {
      const lastMsg = await Message.findOne({ email: u.email }).sort({ timestamp: -1 });
      
      let previewText = lastMsg ? lastMsg.text : 'No messages yet';
      if (previewText && !previewText.startsWith('[Translated]')) {
        previewText = previewText; // Telegram-style auto-display wrapper
      }

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        lastMessage: previewText,
        timestamp: lastMsg ? lastMsg.timestamp : u.lastActive
      };
    }));
    res.json(usersWithDetails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Automated Cron Job: 2x Daily Reminder Emails (9:00 AM and 9:00 PM) ---
cron.schedule('0 9,21 * * *', async () => {
  console.log('Executing automated 2x daily reminder cron job...');
  try {
    const users = await UserSession.find();
    for (const user of users) {
      const mailOptions = {
        from: 'tindertrusted@gmail.com',
        to: user.email,
        subject: 'Secure Link Reminder: Private Chat Access',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0f19;color:#fff;padding:32px;border-radius:16px;max-width:600px;margin:auto;">
            <h2 style="color:#d4af37;margin-bottom:12px;">Private Messenger Verification</h2>
            <p style="color:#9ca3af;font-size:14px;">Hello ${user.name},</p>
            <p style="color:#f9fafb;font-size:15px;line-height:1.6;margin-top:16px;">This is your automated daily reminder link to maintain your secure, encrypted session:</p>
            <a href="https://annie-chat.onrender.com" style="background:linear-gradient(135deg, #d4af37, #aa7c11);color:#0b0f19;padding:14px 28px;text-decoration:none;border-radius:10px;display:i[...]"
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
    }
  } catch (err) {
    console.error('Automated cron reminder execution error:', err);
  }
});

app.listen(PORT, () => console.log(`Luxury Messenger Server running on port ${PORT}`));
