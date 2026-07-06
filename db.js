const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuration for MySQL Server
const dbConfig = {
    host: process.env.DB_SERVER || 'localhost',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    port: parseInt(process.env.DB_PORT) || 3306,
    connectTimeout: 5000 // 5 seconds timeout to fail fast
};

const JSON_DB_PATH = path.join(__dirname, 'bookings_db.json');
const JSON_SCHEMES_PATH = path.join(__dirname, 'schemes_db.json');

// Global engine state flags
let useSqlDB = false;
let sqlPool = null;

// Initial high-quality mock bookings removed

// Initial mock schemes removed

function getOffsetDateString(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// -------------------------------------------------------------
// JSON Local Database Fallback Helpers
// -------------------------------------------------------------
function readJsonDb() {
    if (!fs.existsSync(JSON_DB_PATH)) {
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify([], null, 2), 'utf-8');
        return [];
    }
    try {
        const data = fs.readFileSync(JSON_DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading JSON bookings DB. Resetting it...', err);
        return [];
    }
}

function writeJsonDb(data) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function readSchemesDb() {
    if (!fs.existsSync(JSON_SCHEMES_PATH)) {
        fs.writeFileSync(JSON_SCHEMES_PATH, JSON.stringify([], null, 2), 'utf-8');
        return [];
    }
    try {
        const data = fs.readFileSync(JSON_SCHEMES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading JSON schemes DB. Resetting it...', err);
        return [];
    }
}

function writeSchemesDb(data) {
    fs.writeFileSync(JSON_SCHEMES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// -------------------------------------------------------------
// Initialize Database Connection Engine
// -------------------------------------------------------------
async function initializeDB() {
    const hasCredentials = dbConfig.user && dbConfig.password && dbConfig.database;

    if (!hasCredentials) {
        console.log('\n======================================================');
        console.log('⚠️  MYSQL ENVIRONMENT VARIABLES ARE NOT FULLY SET.');
        console.log('👉 Running in [LOCAL JSON DATABASE MODE] (bookings_db.json / schemes_db.json)');
        console.log('======================================================\n');
        useSqlDB = false;
        return;
    }

    try {
        console.log(`Connecting to MySQL Server at ${dbConfig.host}:${dbConfig.port}...`);
        sqlPool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            port: dbConfig.port,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Test the connection
        const connection = await sqlPool.getConnection();
        connection.release();

        useSqlDB = true;
        console.log('\n======================================================');
        console.log('⚡ SUCCESSFULLY CONNECTED TO MYSQL SERVER!');
        console.log(`👉 Running in [MYSQL SERVER DATABASE MODE] (${dbConfig.database})`);
        console.log('======================================================\n');
    } catch (err) {
        console.log('\n======================================================');
        console.log('❌ FAILED TO CONNECT TO MYSQL SERVER:');
        console.log(`   Error: ${err.message}`);
        console.log('👉 Falling back to [LOCAL JSON DATABASE MODE] (bookings_db.json / schemes_db.json)');
        console.log('   All features will remain 100% active and simulated!');
        console.log('======================================================\n');
        useSqlDB = false;
        sqlPool = null;
    }
}

// Run initial database setup
initializeDB();

// -------------------------------------------------------------
// Core Database CRUD Methods with Hybrid Execution
// -------------------------------------------------------------

/**
 * Get all booking records
 */
async function getAllBookings() {
    if (useSqlDB) {
        try {
            const query = `
                SELECT 
                    id, 
                    visitor_name, 
                    visitor_email, 
                    visitor_phone, 
                    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, 
                    booking_time, 
                    visitor_count, 
                    scheme_name,
                    special_requests, 
                    status, 
                    created_at 
                FROM bookings 
                ORDER BY booking_date DESC, booking_time ASC
            `;
            const [rows] = await sqlPool.query(query);
            return {
                data: rows,
                sqlQuery: query.trim(),
                engine: 'MySQL Server'
            };
        } catch (err) {
            console.error('SQL query failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // JSON Fallback / Simulation
    const bookings = readJsonDb();
    bookings.sort((a, b) => {
        if (a.booking_date !== b.booking_date) {
            return b.booking_date.localeCompare(a.booking_date);
        }
        return a.booking_time.localeCompare(b.booking_time);
    });

    const simulatedQuery = `SELECT * FROM bookings ORDER BY booking_date DESC, booking_time ASC;`;
    return {
        data: bookings,
        sqlQuery: simulatedQuery,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

/**
 * Create a new booking
 */
async function createBooking(data) {
    const { visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests } = data;
    const vCount = parseInt(visitor_count) || 1;

    if (useSqlDB) {
        try {
            // Check conflict
            const conflictQuery = `
                SELECT COUNT(*) as count 
                FROM bookings 
                WHERE booking_date = ? AND booking_time = ? AND status != 'Cancelled'
            `;
            const [conflictCheck] = await sqlPool.query(conflictQuery, [booking_date, booking_time]);

            if (conflictCheck[0].count > 0) {
                throw new Error('This date and time slot is already booked.');
            }

            const insertQuery = `
                INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed')
            `;

            const [insertResult] = await sqlPool.query(insertQuery, [
                visitor_name,
                visitor_email,
                visitor_phone,
                booking_date,
                booking_time,
                vCount,
                scheme_name,
                special_requests || null
            ]);

            const insertId = insertResult.insertId;

            // Retrieve inserted record
            const selectQuery = `
                SELECT 
                    id, visitor_name, visitor_email, visitor_phone, 
                    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, booking_time, 
                    visitor_count, scheme_name, special_requests, status, created_at
                FROM bookings
                WHERE id = ?
            `;
            const [fetchedRows] = await sqlPool.query(selectQuery, [insertId]);

            const simulatedSql = `
INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)
VALUES ('${visitor_name}', '${visitor_email}', '${visitor_phone}', '${booking_date}', '${booking_time}', ${vCount}, '${scheme_name}', ${special_requests ? `'${special_requests}'` : 'NULL'}, 'Confirmed');
            `.trim();

            return {
                booking: fetchedRows[0],
                sqlQuery: simulatedSql,
                engine: 'MySQL Server'
            };
        } catch (err) {
            if (err.message.includes('already booked')) throw err;
            console.error('SQL create failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // JSON Fallback / Simulation
    const bookings = readJsonDb();
    const isConflict = bookings.some(b => b.booking_date === booking_date && b.booking_time === booking_time && b.status !== 'Cancelled');
    if (isConflict) {
        throw new Error('This date and time slot is already booked.');
    }

    const newId = bookings.length > 0 ? Math.max(...bookings.map(b => b.id)) + 1 : 1;
    const newBooking = {
        id: newId,
        visitor_name,
        visitor_email,
        visitor_phone,
        booking_date,
        booking_time,
        visitor_count: vCount,
        scheme_name,
        special_requests: special_requests || '',
        status: 'Confirmed',
        created_at: new Date().toISOString()
    };

    bookings.push(newBooking);
    writeJsonDb(bookings);

    const simulatedSql = `
INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)
VALUES ('${visitor_name}', '${visitor_email}', '${visitor_phone}', '${booking_date}', '${booking_time}', ${vCount}, '${scheme_name}', ${special_requests ? `'${special_requests}'` : 'NULL'}, 'Confirmed');
    `.trim();

    return {
        booking: newBooking,
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

/**
 * Reschedule an existing booking
 */
async function rescheduleBooking(id, date, time) {
    const bookingId = parseInt(id);

    if (useSqlDB) {
        try {
            // Check conflict for new time, excluding the current booking itself
            const conflictQuery = `
                SELECT COUNT(*) as count 
                FROM bookings 
                WHERE booking_date = ? AND booking_time = ? AND id != ? AND status != 'Cancelled'
            `;
            const [conflictCheck] = await sqlPool.query(conflictQuery, [date, time, bookingId]);

            if (conflictCheck[0].count > 0) {
                throw new Error('The selected new time slot is already booked.');
            }

            const updateQuery = `
                UPDATE bookings 
                SET booking_date = ?, booking_time = ?, status = 'Rescheduled'
                WHERE id = ?
            `;
            await sqlPool.query(updateQuery, [date, time, bookingId]);

            // Retrieve updated record
            const selectQuery = `
                SELECT 
                    id, visitor_name, visitor_email, visitor_phone, 
                    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, booking_time, 
                    visitor_count, scheme_name, special_requests, status, created_at
                FROM bookings
                WHERE id = ?
            `;
            const [fetchedRows] = await sqlPool.query(selectQuery, [bookingId]);

            if (fetchedRows.length === 0) {
                throw new Error('Booking not found.');
            }

            const simulatedSql = `
UPDATE bookings 
SET booking_date = '${date}', booking_time = '${time}', status = 'Rescheduled' 
WHERE id = ${bookingId};
            `.trim();

            return {
                booking: fetchedRows[0],
                sqlQuery: simulatedSql,
                engine: 'MySQL Server'
            };
        } catch (err) {
            if (err.message.includes('already booked') || err.message.includes('not found')) throw err;
            console.error('SQL reschedule failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // JSON Fallback
    const bookings = readJsonDb();
    const isConflict = bookings.some(b => b.booking_date === date && b.booking_time === time && b.id !== bookingId && b.status !== 'Cancelled');
    if (isConflict) {
        throw new Error('The selected new time slot is already booked.');
    }

    const bookingIndex = bookings.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) {
        throw new Error('Booking not found.');
    }

    bookings[bookingIndex].booking_date = date;
    bookings[bookingIndex].booking_time = time;
    bookings[bookingIndex].status = 'Rescheduled';

    writeJsonDb(bookings);

    const simulatedSql = `
UPDATE bookings 
SET booking_date = '${date}', booking_time = '${time}', status = 'Rescheduled' 
WHERE id = ${bookingId};
    `.trim();

    return {
        booking: bookings[bookingIndex],
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

/**
 * Cancel a booking (soft delete)
 */
async function deleteBooking(id) {
    const bookingId = parseInt(id);

    if (useSqlDB) {
        try {
            const deleteQuery = `
                UPDATE bookings 
                SET status = 'Cancelled'
                WHERE id = ?
            `;
            await sqlPool.query(deleteQuery, [bookingId]);

            // Retrieve updated record
            const selectQuery = `
                SELECT 
                    id, visitor_name, visitor_email, visitor_phone, 
                    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, booking_time, 
                    visitor_count, scheme_name, special_requests, status, created_at
                FROM bookings
                WHERE id = ?
            `;
            const [fetchedRows] = await sqlPool.query(selectQuery, [bookingId]);

            if (fetchedRows.length === 0) {
                throw new Error('Booking not found.');
            }

            const simulatedSql = `
UPDATE bookings 
SET status = 'Cancelled' 
WHERE id = ${bookingId};
            `.trim();

            return {
                booking: fetchedRows[0],
                sqlQuery: simulatedSql,
                engine: 'MySQL Server'
            };
        } catch (err) {
            if (err.message.includes('not found')) throw err;
            console.error('SQL cancellation failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // JSON Fallback
    const bookings = readJsonDb();
    const bookingIndex = bookings.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) {
        throw new Error('Booking not found.');
    }

    bookings[bookingIndex].status = 'Cancelled';
    writeJsonDb(bookings);

    const simulatedSql = `
UPDATE bookings 
SET status = 'Cancelled' 
WHERE id = ${bookingId};
    `.trim();

    return {
        booking: bookings[bookingIndex],
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

/**
 * Retrieve booking statistics
 */
async function getStats() {
    if (useSqlDB) {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as totalBookings,
                    COALESCE(SUM(visitor_count), 0) as totalVisitors,
                    SUM(CASE WHEN booking_date >= CURDATE() AND status != 'Cancelled' THEN 1 ELSE 0 END) as upcomingTours,
                    SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledBookings
                FROM bookings
            `;
            const [statsRows] = await sqlPool.query(statsQuery);
            const stats = statsRows[0];
            return {
                stats: {
                    totalBookings: Number(stats.totalBookings) || 0,
                    totalVisitors: Number(stats.totalVisitors) || 0,
                    upcomingTours: Number(stats.upcomingTours) || 0,
                    cancelledBookings: Number(stats.cancelledBookings) || 0
                },
                sqlQuery: statsQuery.trim(),
                engine: 'MySQL Server'
            };
        } catch (err) {
            console.error('SQL stats failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // JSON Fallback
    const bookings = readJsonDb();
    const today = new Date().toISOString().split('T')[0];

    const totalBookings = bookings.length;
    const totalVisitors = bookings.reduce((sum, b) => sum + (b.visitor_count || 0), 0);
    const upcomingTours = bookings.filter(b => b.booking_date >= today && b.status !== 'Cancelled').length;
    const cancelledBookings = bookings.filter(b => b.status === 'Cancelled').length;

    const simulatedSql = `
SELECT 
    COUNT(*) as totalBookings,
    SUM(visitor_count) as totalVisitors,
    SUM(CASE WHEN booking_date >= CURDATE() AND status != 'Cancelled' THEN 1 ELSE 0 END) as upcomingTours,
    SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledBookings
FROM bookings;
    `.trim();

    return {
        stats: {
            totalBookings,
            totalVisitors,
            upcomingTours,
            cancelledBookings
        },
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

// -------------------------------------------------------------
// House Scheme Methods
// -------------------------------------------------------------

/**
 * Get all active Schemes
 */
async function getAllSchemes() {
    if (useSqlDB) {
        try {
            const query = `
                SELECT id, name, address, price, viewing_rules, description
                FROM schemes
                ORDER BY id ASC
            `;
            const [rows] = await sqlPool.query(query);
            return {
                data: rows,
                sqlQuery: query.trim(),
                engine: 'MySQL Server'
            };
        } catch (err) {
            console.error('SQL query schemes failed. Using JSON fallback.', err);
            throw err;
        }
    }

    // Fallback JSON schemes
    const schemes = readSchemesDb();
    const simulatedSql = `SELECT id, name, address, price, viewing_rules, description FROM schemes ORDER BY id ASC;`;
    return {
        data: schemes,
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

/**
 * Create a new Scheme (Admin feature)
 */
async function createScheme(data) {
    const { name, address, price, viewing_rules, description } = data;

    if (useSqlDB) {
        try {
            const insertQuery = `
                INSERT INTO schemes (name, address, price, viewing_rules, description)
                VALUES (?, ?, ?, ?, ?)
            `;

            const [insertResult] = await sqlPool.query(insertQuery, [
                name,
                address || null,
                price,
                viewing_rules || null,
                description || null
            ]);

            const insertId = insertResult.insertId;

            // Retrieve newly inserted scheme
            const selectQuery = `
                SELECT id, name, address, price, viewing_rules, description
                FROM schemes
                WHERE id = ?
            `;
            const [fetchedRows] = await sqlPool.query(selectQuery, [insertId]);

            const simulatedSql = `
INSERT INTO schemes (name, address, price, viewing_rules, description)
VALUES ('${name}', ${address ? `'${address}'` : 'NULL'}, '${price}', ${viewing_rules ? `'${viewing_rules}'` : 'NULL'}, ${description ? `'${description}'` : 'NULL'});
            `.trim();

            return {
                scheme: fetchedRows[0],
                sqlQuery: simulatedSql,
                engine: 'MySQL Server'
            };
        } catch (err) {
            console.error('SQL create scheme failed:', err);
            throw err;
        }
    }

    // JSON Fallback / Simulation
    // FIX: address field was missing from newScheme object — caused undefined on read-back
    // which crashed renderSchemesTable() in the frontend
    const schemes = readSchemesDb();

    const isConflict = schemes.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (isConflict) {
        throw new Error('A scheme with this property name already exists.');
    }

    const newId = schemes.length > 0 ? Math.max(...schemes.map(s => s.id)) + 1 : 1;
    const newScheme = {
        id: newId,
        name,
        address: address || '',          // FIX: was missing entirely
        price,
        viewing_rules: viewing_rules || '',
        description: description || ''
    };

    schemes.push(newScheme);
    writeSchemesDb(schemes);

    const simulatedSql = `
INSERT INTO schemes (name, address, price, viewing_rules, description)
VALUES ('${name}', ${address ? `'${address}'` : 'NULL'}, '${price}', ${viewing_rules ? `'${viewing_rules}'` : 'NULL'}, ${description ? `'${description}'` : 'NULL'});
    `.trim();

    return {
        scheme: newScheme,
        sqlQuery: simulatedSql,
        engine: 'Simulated JSON Database (SQL Fallback)'
    };
}

module.exports = {
    getAllBookings,
    createBooking,
    rescheduleBooking,
    deleteBooking,
    getStats,
    getAllSchemes,
    createScheme,
    initializeDB
};