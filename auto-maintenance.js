/**
 * AUTO-MAINTENANCE & SELF-HEALING SUITE
 * Operates independently to keep your server clean, fast, and secure.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://samdrajames205_db_user:felix123@cluster0.7j6ppge.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const MAX_MEMORY_MB = 450; // Auto-restart threshold if server uses too much RAM
const TEMP_DIR = path.join(__dirname, 'public', 'uploads'); // Temp video/image cache folder

console.log('[Auto-Maintenance] Watchdog service activated.');

// 1. DATABASE & LOG CLEANUP (Runs every 24 Hours)
async function cleanDatabaseAndLogs() {
    console.log('[Auto-Maintenance] Running daily database & storage cleanup...');
    try {
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGO_URI);
        }

        // Delete call logs older than 30 days automatically
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const CallLog = mongoose.model('CallLog', new mongoose.Schema({ timestamp: Date }));
        const deletedCalls = await CallLog.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
        console.log(`[Auto-Maintenance] Purged ${deletedCalls.deletedCount} old call logs.`);

        // Clear temporary cached uploads
        if (fs.existsSync(TEMP_DIR)) {
            const files = fs.readdirSync(TEMP_DIR);
            const now = Date.now();
            files.forEach(file => {
                const filePath = path.join(TEMP_DIR, file);
                const stats = fs.statSync(filePath);
                // Remove files older than 24 hours
                if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    console.log(`[Auto-Maintenance] Cleaned temp file: ${file}`);
                }
            });
        }
    } catch (err) {
        console.error('[Auto-Maintenance Error] Cleanup failed:', err.message);
    }
}

// 2. MEMORY WATCHDOG & SELF-HEAL (Checks every 5 Minutes)
function checkMemoryAndHealth() {
    const memoryUsageMB = process.memoryUsage().rss / 1024 / 1024;
    console.log(`[Auto-Maintenance] Current Memory Footprint: ${memoryUsageMB.toFixed(2)} MB`);

    if (memoryUsageMB > MAX_MEMORY_MB) {
        console.warn('[Auto-Maintenance Warning] High memory detected! Initiating graceful restart...');
        // Gracefully restart application process via PM2 or Node system process
        exec('pm2 reload server', (error) => {
            if (error) {
                console.error('[Auto-Maintenance] PM2 reload fallback: Restarting node process directly.');
                process.exit(1); // Process manager will instantly restart a fresh instance
            }
        });
    }
}

// 3. SCHEDULED TASKS
// Run memory check every 5 minutes
setInterval(checkMemoryAndHealth, 5 * 60 * 1000);

// Run database and disk cleanup every 24 hours
setInterval(cleanDatabaseAndLogs, 24 * 60 * 60 * 1000);

// Run initial cleanup on startup
cleanDatabaseAndLogs();
