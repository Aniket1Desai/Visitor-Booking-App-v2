const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const db = require('./db');
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing middlewares
app.use(cors());
app.use(express.json());

// Serve gorgeous Glassmorphism frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Helper - Send a record to SharePoint via Power Automate
// Returns { synced: true } on success, or { synced: false, error }
// It NEVER throws, so a SharePoint failure can't crash the request.
// -------------------------------------------------------------
async function sendToSharePoint(flowUrl, flowUrlName, payload) {
    if (!flowUrl) {
        const msg = `${flowUrlName} is not set in environment`;
        console.error(`⚠️  ${msg} — skipping SharePoint sync`);
        return { synced: false, error: msg };
    }

    try {
        const response = await axios.post(flowUrl, payload, { httpsAgent: agent });
        console.log(`✅ SharePoint sync OK (${flowUrlName}) — status`, response.status);
        return { synced: true, status: response.status, data: response.data };
    } catch (err) {
        // Surface the real reason: flow error body if present, else the message
        const detail = err.response
            ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
            : err.message;
        console.error(`❌ SharePoint sync FAILED (${flowUrlName}):`, detail);
        return { synced: false, error: detail };
    }
}

// -------------------------------------------------------------
// REST API Endpoints - Bookings Operations
// -------------------------------------------------------------

/**
 * GET /api/bookings
 * Retrieves all bookings in descending date order, including SQL trace logs
 */
app.get('/api/bookings', async (req, res) => {
    try {
        const result = await db.getAllBookings();
        res.json({ data: result.data });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve bookings', details: err.message });
    }
});

/**
 * POST /api/bookings
 * Creates a new house viewing booking mapped to a scheme
 */
app.post('/api/bookings', async (req, res) => {
    const { visitor_name, visitor_email, visitor_phone, booking_time, visitor_count, scheme_name, special_requests } = req.body;
    const booking_date = req.body.booking_date || new Date().toISOString().split('T')[0];

    if (!visitor_name || !visitor_email || !visitor_phone || !booking_date || !booking_time || !scheme_name) {
        return res.status(400).json({ error: 'Missing required booking fields (name, email, phone, date, time, scheme_name)' });
    }

    try {
        // Step 1 - Save locally / to Railway first (this is our source of truth)
        let booking = null;
        try {
            const dbResult = await db.createBooking({
                visitor_name,
                visitor_email,
                visitor_phone,
                booking_date,
                booking_time,
                visitor_count,
                scheme_name,
                special_requests
            });
            booking = dbResult.booking;
            console.log('✅ Booking saved locally / Railway');
        } catch (dbError) {
            // A genuine business rule (double booking) should stop the whole request
            if (dbError.message.includes('already booked')) {
                return res.status(409).json({ error: dbError.message });
            }
            throw dbError;
        }

        // Step 2 - Push to SharePoint (does not throw)
        const sp = await sendToSharePoint(
            process.env.POWER_AUTOMATE_BOOKINGS_URL,
            'POWER_AUTOMATE_BOOKINGS_URL',
            {
                table: 'bookings',
                data: {
                    visitor_name,
                    visitor_email,
                    visitor_phone,
                    booking_date,
                    booking_time,
                    visitor_count,
                    scheme_name,
                    special_requests: special_requests || ''
                }
            }
        );

        // 201 if fully synced, 207 (Multi-Status) if saved locally but SharePoint failed
        res.status(sp.synced ? 201 : 207).json({
            success: true,
            synced: sp.synced,
            booking,
            storage: sp.synced ? 'SharePoint + Local' : 'Local only',
            syncError: sp.synced ? undefined : sp.error
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to create booking', details: err.message });
    }
});

/**
 * PUT /api/bookings/:id
 * Reschedules a viewing with slot checking
 */
app.put('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const { booking_date, booking_time } = req.body;

    if (!booking_date || !booking_time) {
        return res.status(400).json({ error: 'Missing date or time for rescheduling.' });
    }

    try {
        const result = await db.rescheduleBooking(id, booking_date, booking_time);
        res.json({ booking: result.booking });
    } catch (err) {
        if (err.message.includes('already booked')) {
            return res.status(409).json({ error: err.message });
        }
        if (err.message.includes('not found')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to reschedule booking', details: err.message });
    }
});

/**
 * DELETE /api/bookings/:id
 * Soft cancels a booked house viewing session
 */
app.delete('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.deleteBooking(id);
        res.json({ booking: result.booking });
    } catch (err) {
        if (err.message.includes('not found')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to cancel booking', details: err.message });
    }
});

/**
 * GET /api/stats
 * Computes dashboard statistics (visitor tallies, remaining counts)
 */
app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.getStats();
        res.json({ stats: result.stats });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
    }
});

// -------------------------------------------------------------
// REST API Endpoints - House Scheme Operations
// -------------------------------------------------------------

/**
 * GET /api/schemes
 * Retrieves all registered property viewing schemes.
 */
app.get('/api/schemes', async (req, res) => {
    try {
        const result = await db.getAllSchemes();
        res.json({
            data: result.data || []
        });
    } catch (err) {
        console.error('GET /api/schemes error:', err.message);
        res.status(500).json({
            data: [],
            error: 'Failed to retrieve schemes',
            details: err.message
        });
    }
});

/**
 * POST /api/schemes
 * Creates a new property scheme option (Admin feature)
 */
app.post('/api/schemes', async (req, res) => {
    const { name, address, price, viewing_rules, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Missing required scheme fields (name, price)' });
    }

    try {
        // Step 1 - Save locally / Railway first (source of truth).
        // A duplicate-name error is a real business rule -> stop here with 409.
        let scheme = null;
        try {
            const result = await db.createScheme({ name, address, price, viewing_rules, description });
            scheme = result.scheme;
            console.log('✅ Scheme saved locally / Railway');
        } catch (dbError) {
            if (dbError.message.includes('already exists')) {
                return res.status(409).json({ error: dbError.message });
            }
            throw dbError;
        }

        // Step 2 - Push to SharePoint via Power Automate (does not throw).
        console.log('Calling Scheme Flow...');
        const sp = await sendToSharePoint(
            process.env.POWER_AUTOMATE_SCHEMES_URL,
            'POWER_AUTOMATE_SCHEMES_URL',
            {
                table: 'schemes',
                data: { name, address, price, viewing_rules, description }
            }
        );

        // Return the created scheme so the frontend can add it to the grid instantly,
        // plus an honest synced flag so the UI can show the right notification.
        res.status(sp.synced ? 201 : 207).json({
            success: true,
            synced: sp.synced,
            scheme,
            storage: sp.synced ? 'SharePoint + Local' : 'Local only',
            syncError: sp.synced ? undefined : sp.error
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to create scheme', details: err.message });
    }
});

// -------------------------------------------------------------
// Sync API Endpoints - Railway DB to SharePoint
// -------------------------------------------------------------

/**
 * POST /api/sync/bookings
 * Manually triggers Railway → SharePoint bookings sync
 */
app.post('/api/sync/bookings', async (req, res) => {
    try {
        await syncBookings();
        res.json({ success: true, message: 'Bookings synced to SharePoint successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/sync/schemes
 * Manually triggers Railway → SharePoint schemes sync
 */
app.post('/api/sync/schemes', async (req, res) => {
    try {
        await syncSchemes();
        res.json({ success: true, message: 'Schemes synced to SharePoint successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Serve frontend SPA for all other non-matching routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Open Nest Booking Application running on http://localhost:${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser to view the Open Nest Tour system.\n`);
});