const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // Allows base64 photo uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Atlas Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://samdrajames205_db_user:ITL2EIBM7Q5kZvNp@cluster0.7j6ppge.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Database Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    displayName: { type: String, default: 'Private Chat' },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    email: String,
    sender: String, // 'user' or 'owner'
    text: String,
    image: String, // Base64 image payload support
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Nodemailer Configuration (Using your exact Gmail and App Password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'tindertrusted@gmail.com',
        pass: process.env.EMAIL_PASS || 'pcqbawajigvghjoo'
    }
});

// API Routes
app.post('/api/register', async (req, res) => {
    try {
        const { email, displayName } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ email, displayName: displayName || 'Private Chat' });
            await user.save();
        } else if (displayName) {
            user.displayName = displayName;
            await user.save();
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/messages/:email', async (req, res) => {
    try {
        const messages = await Message.find({ email: req.params.email }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { email, text, image, sender } = req.body;
        const newMsg = new Message({ email, text, image, sender: sender || 'user' });
        await newMsg.save();
        res.json({ success: true, message: newMsg });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Automated Daily Reminder Cron Job (Runs every day at 9:00 AM)
cron.schedule('0 9 * * *', async () => {
    try {
        const users = await User.find({});
        for (const user of users) {
            const name = user.displayName || 'Private Chat';
            const mailOptions = {
                from: `"Private Messenger" <tindertrusted@gmail.com>`,
                to: user.email,
                subject: `Your daily reminder: Chat with ${name}`,
                html: `<div style="font-family:sans-serif;padding:20px;background:#f8f9fa;border-radius:10px;">
                    <h2>Hello! ❤️</h2>
                    <p>Here is your secure, direct link to continue our private conversation anytime:</p>
                    <a href="https://annie-chat.onrender.com?email=${encodeURIComponent(user.email)}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#white;text-decoration:none;border-radius:25px;font-weight:bold;margin-top:10px;">Open Secure Chat</a>
                </div>`
            };
            await transporter.sendMail(mailOptions);
        }
        console.log('Daily reminder emails sent successfully.');
    } catch (err) {
        console.error('Error sending daily emails:', err);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
