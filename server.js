const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection URI - using family: 4 to force IPv4 and bypass Render network restrictions
const uri = process.env.MONGO_URI || "YOUR_MONGODB_URI_HERE";
const client = new MongoClient(uri, {
  family: 4,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB Atlas!");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectDB();

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Cron job for automated daily reminders (runs every day at 9:00 AM)
cron.schedule('0 9 * * *', async () => {
  console.log('Running automated daily reminder task...');
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: 'Annie-chat Daily Reminder',
      text: 'Hello! This is your automated daily reminder from your Annie-chat service.'
    };
    
    await transporter.sendMail(mailOptions);
    console.log('Daily reminder email sent successfully.');
  } catch (error) {
    console.error('Error sending automated email:', error);
  }
});

// Basic Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Secure Admin Management Route
app.get('/annie-admin-secure-xyz', (req, res) => {
  res.send('Welcome to the secure Annie-chat admin dashboard.');
});

// Start Express server immediately to satisfy Render port binding checks
app.listen(port, () => {
  console.log(`Server is running live on port ${port}`);
});
