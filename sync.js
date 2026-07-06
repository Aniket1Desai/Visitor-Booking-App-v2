require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');
const https = require('https');

// ─── SSL Agent ───────────────────────────────────────────────────
const agent = new https.Agent({ rejectUnauthorized: false });

// ─── Railway DB Config ───────────────────────────────────────────
const railwayConfig = {
    host: process.env.RAILWAY_HOST,
    user: process.env.RAILWAY_USER,
    password: process.env.RAILWAY_PASSWORD,
    database: process.env.RAILWAY_DATABASE,
    port: parseInt(process.env.RAILWAY_PORT)
};

// ─── Safe date helper ────────────────────────────────────────────
function toDateStr(val) {
    if (!val) return null;
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return null;   // catches Invalid Date
        const iso = d.toISOString().split('T')[0];
        if (iso === '0000-00-00') return null;
        return iso;
    } catch {
        return null;
    }
}

// ─── Sync Bookings ───────────────────────────────────────────────
async function syncBookings() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    console.log('Bookings sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM bookings`);
    console.log(`Found ${rows.length} bookings`);

    for (const row of rows) {
        try {
            const dateStr = toDateStr(row.booking_date);
            if (!dateStr) {
                console.log(`⚠️ Skipped booking ID ${row.id} - invalid booking_date:`, row.booking_date);
                continue;
            }

            await axios.post(process.env.POWER_AUTOMATE_BOOKINGS_URL, {
                table: 'bookings',
                data: { ...row, booking_date: dateStr, special_requests: row.special_requests ?? '' }
            }, { httpsAgent: agent });

            console.log(`✅ Sent booking ID ${row.id}`);
        } catch (err) {
            console.error(`❌ Failed booking ID ${row.id}:`, err.message);
        }
    }

    await railwayDb.end();
    console.log('Bookings sync completed.');
}

// ─── Sync Schemes ────────────────────────────────────────────────
async function syncSchemes() {
    const railwayDb = await mysql.createConnection(railwayConfig);
    console.log('Schemes sync started...');

    const [rows] = await railwayDb.execute(`SELECT * FROM schemes`);
    console.log(`Found ${rows.length} schemes`);

    for (const row of rows) {
        try {
            await axios.post(process.env.POWER_AUTOMATE_SCHEMES_URL, {
                table: 'schemes',
                data: {
                    ...row,
                    id: String(row.id),
                    price: String(row.price)
                }
            }, { httpsAgent: agent });

            console.log(`✅ Sent scheme ID ${row.id}`);
        } catch (err) {
            console.error(`❌ Failed scheme ID ${row.id}:`, err.message);
        }
    }

    await railwayDb.end();
    console.log('Schemes sync completed.');
}

module.exports = { syncBookings, syncSchemes };