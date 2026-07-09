/**
 * Open Nest Visitor Booking — Express Backend
 *
 * SharePoint is the sole data store. Every request is forwarded through
 * Power Automate HTTP flows (see db.js). No local file storage or MySQL.
 *
 * Routes:
 *   GET    /api/bookings          — fetch all bookings from SharePoint
 *   POST   /api/bookings          — create booking in SharePoint
 *   PUT    /api/bookings/:id      — reschedule booking in SharePoint
 *   DELETE /api/bookings/:id      — cancel (soft-delete) booking in SharePoint
 *   GET    /api/stats             — compute dashboard stats from SharePoint data
 *
 *   GET    /api/schemes           — fetch all schemes from SharePoint
 *   POST   /api/schemes           — create scheme in SharePoint
 *   PUT    /api/schemes/:id       — update scheme in SharePoint
 *   DELETE /api/schemes/:id       — delete scheme from SharePoint
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// BOOKINGS
// ============================================================

/**
 * GET /api/bookings
 * Returns all bookings from SharePoint sorted by date desc / time asc.
 */
app.get('/api/bookings', async (req, res) => {
    try {
        const result = await db.getAllBookings();
        res.json({ data: result.data });
    } catch (err) {
        console.error('GET /api/bookings error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve bookings', details: err.message });
    }
});

/**
 * POST /api/bookings
 * Creates a new booking in SharePoint after validating required fields
 * and checking for slot conflicts.
 */
app.post('/api/bookings', async (req, res) => {
    const {
        visitor_name, visitor_email, visitor_phone,
        booking_time, visitor_count, scheme_name, special_requests
    } = req.body;
    const booking_date = req.body.booking_date || new Date().toISOString().split('T')[0];

    if (!visitor_name || !visitor_email || !visitor_phone || !booking_date || !booking_time || !scheme_name) {
        return res.status(400).json({
            error: 'Missing required booking fields (name, email, phone, date, time, scheme_name)'
        });
    }

    try {
        const result = await db.createBooking({
            visitor_name, visitor_email, visitor_phone,
            booking_date, booking_time,
            visitor_count, scheme_name, special_requests
        });
        res.status(201).json({ success: true, booking: result.booking });
    } catch (err) {
        if (err.message.includes('already booked')) {
            return res.status(409).json({ error: err.message });
        }
        console.error('POST /api/bookings error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create booking', details: err.message });
    }
});

/**
 * PUT /api/bookings/:id
 * Reschedules a booking — updates date, time and marks as Rescheduled.
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
        if (err.message.includes('already booked')) return res.status(409).json({ error: err.message });
        if (err.message.includes('not found'))      return res.status(404).json({ error: err.message });
        console.error('PUT /api/bookings/:id error:', err.message);
        res.status(500).json({ error: 'Failed to reschedule booking', details: err.message });
    }
});

/**
 * DELETE /api/bookings/:id
 * Soft-cancels a booking by setting its status to Cancelled in SharePoint.
 */
app.delete('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.deleteBooking(id);
        res.json({ booking: result.booking });
    } catch (err) {
        if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
        console.error('DELETE /api/bookings/:id error:', err.message);
        res.status(500).json({ error: 'Failed to cancel booking', details: err.message });
    }
});

/**
 * GET /api/stats
 * Derives dashboard statistics (totals, upcoming tours, cancellations)
 * from live SharePoint booking data.
 */
app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.getStats();
        res.json({ stats: result.stats });
    } catch (err) {
        console.error('GET /api/stats error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
    }
});

// ============================================================
// SCHEMES
// ============================================================

/**
 * GET /api/schemes
 * Returns all property viewing schemes from SharePoint.
 */
app.get('/api/schemes', async (req, res) => {
    try {
        const result = await db.getAllSchemes();
        res.json({ data: result.data || [] });
    } catch (err) {
        console.error('GET /api/schemes error:', err.message);
        res.status(500).json({ data: [], error: 'Failed to retrieve schemes', details: err.message });
    }
});

/**
 * POST /api/schemes
 * Creates a new property scheme in SharePoint.
 */
app.post('/api/schemes', async (req, res) => {
    const { name, address, price, viewing_rules, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Missing required scheme fields (name, price)' });
    }

    try {
        const result = await db.createScheme({ name, address, price, viewing_rules, description });
        res.status(201).json({ success: true, scheme: result.scheme });
    } catch (err) {
        if (err.message.includes('already exists')) return res.status(409).json({ error: err.message });
        console.error('POST /api/schemes error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create scheme', details: err.message });
    }
});

/**
 * PUT /api/schemes/:id
 * Updates an existing property scheme in SharePoint.
 */
app.put('/api/schemes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, address, price, viewing_rules, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Missing required scheme fields (name, price)' });
    }

    try {
        const result = await db.updateScheme(id, { name, address, price, viewing_rules, description });
        res.json({ success: true, scheme: result.scheme });
    } catch (err) {
        if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
        console.error('PUT /api/schemes/:id error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update scheme', details: err.message });
    }
});

/**
 * DELETE /api/schemes/:id
 * Permanently deletes a property scheme from SharePoint.
 */
app.delete('/api/schemes/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.deleteScheme(id);
        res.json({ success: true, scheme: result.scheme });
    } catch (err) {
        if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
        console.error('DELETE /api/schemes/:id error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to delete scheme', details: err.message });
    }
});

// ============================================================
// SPA fallback — must be last
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Open Nest Booking Application running on http://localhost:${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser to view the Open Nest Tour system.\n`);
});