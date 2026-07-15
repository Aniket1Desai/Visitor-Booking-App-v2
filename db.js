/**
 * SharePoint Data Layer
 *
 * All CRUD operations are performed exclusively through Power Automate HTTP flows
 * which write to / read from SharePoint lists. There is no local database,
 * no JSON file storage, and no MySQL dependency.
 *
 * Flow contract (dispatcher pattern):
 *   POST <FLOW_URL>  { action: "getAll" | "create" | "update" | "delete", id?, data? }
 *
 * The flow is expected to return already-renamed fields (via a Select action),
 * i.e. { items: [ { id, name, ... } ] } for getAll, so this layer does not
 * translate SharePoint column names.
 *
 * Bookings flow  → POWER_AUTOMATE_BOOKINGS_URL
 * Schemes flow   → POWER_AUTOMATE_SCHEMES_URL
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');

// Bypass self-signed cert issues on Power Platform endpoints
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BOOKINGS_URL = process.env.POWER_AUTOMATE_BOOKINGS_URL;
const SCHEMES_URL = process.env.POWER_AUTOMATE_SCHEMES_URL;

// ---------------------------------------------------------------------------
// Internal helper — send a dispatcher request to a Power Automate flow
// ---------------------------------------------------------------------------
async function callFlow(flowUrl, flowName, payload) {
    if (!flowUrl) {
        throw new Error(`${flowName} is not configured in environment variables.`);
    }

    try {
        const response = await axios.post(flowUrl, payload, {
            httpsAgent,
            timeout: 30000
        });
        return response.data;
    } catch (err) {
        const detail = err.response
            ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
            : err.message;
        console.error(`❌ SharePoint flow error (${flowName}):`, detail);
        throw new Error(`SharePoint operation failed [${flowName}]: ${detail}`);
    }
}

// Some flows return their body as a JSON *string* rather than a real object.
// Accept either: if we got a string, try to parse it before reading fields.
function coerceBody(responseData) {
    if (typeof responseData === 'string') {
        try {
            return JSON.parse(responseData);
        } catch {
            return {};
        }
    }
    return responseData || {};
}

// Normalise SharePoint item IDs — SP returns "ID" (uppercase) in some flows
function normaliseItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
        ...item,
        id: item.id ?? item.ID ?? item.Id
    }));
}

// Pull the array out of whatever wrapper the flow used
function extractItems(responseData) {
    const body = coerceBody(responseData);
    return normaliseItems(body.data ?? body.items ?? body.value ?? []);
}

// ---------------------------------------------------------------------------
// BOOKINGS — CRUD
// ---------------------------------------------------------------------------

/**
 * Retrieve all booking records from SharePoint, sorted by date desc / time asc.
 */
async function getAllBookings() {
    const responseData = await callFlow(
        BOOKINGS_URL,
        'POWER_AUTOMATE_BOOKINGS_URL',
        {
            action: 'getAll'
        }
    );

    const items = extractItems(responseData);

    const now = new Date();

    items.sort((a, b) => {
        const dateTimeA = new Date(`${a.booking_date}T${a.booking_time}`);
        const dateTimeB = new Date(`${b.booking_date}T${b.booking_time}`);

        const aUpcoming = dateTimeA >= now;
        const bUpcoming = dateTimeB >= now;

        // Upcoming bookings first
        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;

        if (aUpcoming && bUpcoming) {
            // Closest upcoming booking first
            return dateTimeA - dateTimeB;
        }

        // Past bookings: newest past booking first
        return dateTimeB - dateTimeA;
    });

    return { data: items };
}

/**
 * Create a new booking in SharePoint.
 * Performs an in-memory conflict check against existing bookings first.
 */
async function createBooking(data) {
    const {
        visitor_name, visitor_email, visitor_phone,
        booking_date, booking_time,
        visitor_count, scheme_name, special_requests
    } = data;

    const vCount = parseInt(visitor_count) || 1;

    // Conflict check — fetch current bookings and verify slot availability
    const { data: existing } = await getAllBookings();
    const conflict = existing.some(b =>
        b.booking_date === booking_date &&
        b.booking_time === booking_time &&
        b.status !== 'Cancelled'
    );
    if (conflict) {
        throw new Error('This date and time slot is already booked.');
    }

    const responseData = await callFlow(BOOKINGS_URL, 'POWER_AUTOMATE_BOOKINGS_URL', {
        action: 'create',
        data: {
            visitor_name,
            visitor_email,
            visitor_phone,
            booking_date,
            booking_time,
            visitor_count: vCount,
            scheme_name,
            special_requests: special_requests || '',
            status: 'Confirmed'
        }
    });

    const body = coerceBody(responseData);
    const item = body.item ?? body;
    return { booking: { ...item, id: item.id ?? item.ID ?? item.Id } };
}

/**
 * Reschedule an existing booking — updates date, time and sets status to Rescheduled.
 */
async function rescheduleBooking(id, date, time) {
    const bookingId = parseInt(id);

    // Conflict check — exclude the booking being rescheduled
    const { data: existing } = await getAllBookings();
    const conflict = existing.some(b =>
        b.booking_date === date &&
        b.booking_time === time &&
        Number(b.id) !== bookingId &&
        b.status !== 'Cancelled'
    );
    if (conflict) {
        throw new Error('The selected new time slot is already booked.');
    }

    const target = existing.find(b => Number(b.id) === bookingId);
    if (!target) {
        throw new Error('Booking not found.');
    }

    const responseData = await callFlow(BOOKINGS_URL, 'POWER_AUTOMATE_BOOKINGS_URL', {
        action: 'update',
        id: bookingId,
        data: {
            booking_date: date,
            booking_time: time,
            status: 'Rescheduled'
        }
    });

    const body = coerceBody(responseData);
    const item = body.item ?? { ...target, booking_date: date, booking_time: time, status: 'Rescheduled' };
    return { booking: { ...item, id: item.id ?? item.ID ?? item.Id ?? bookingId } };
}

/**
 * Cancel a booking — soft-delete by setting status to Cancelled.
 */
async function deleteBooking(id) {
    const bookingId = parseInt(id);

    // Verify booking exists before attempting cancel
    const { data: existing } = await getAllBookings();
    const target = existing.find(b => Number(b.id) === bookingId);
    if (!target) {
        throw new Error('Booking not found.');
    }

    const responseData = await callFlow(BOOKINGS_URL, 'POWER_AUTOMATE_BOOKINGS_URL', {
        action: 'delete',
        id: bookingId
    });

    // Return the updated record; if flow doesn't echo it back, reconstruct locally
    const body = coerceBody(responseData);
    const item = body.item ?? { ...target, status: 'Cancelled' };
    return { booking: { ...item, id: item.id ?? item.ID ?? item.Id ?? bookingId } };
}

/**
 * Compute dashboard statistics from live SharePoint data.
 */
async function getStats() {
    const { data: bookings } = await getAllBookings();
    const today = new Date().toISOString().split('T')[0];

    const totalBookings = bookings.length;
    const totalVisitors = bookings.reduce((sum, b) => sum + (parseInt(b.visitor_count) || 0), 0);
    const upcomingTours = bookings.filter(b => b.booking_date >= today && b.status !== 'Cancelled').length;
    const cancelledBookings = bookings.filter(b => b.status === 'Cancelled').length;

    return {
        stats: { totalBookings, totalVisitors, upcomingTours, cancelledBookings }
    };
}

// ---------------------------------------------------------------------------
// SCHEMES — CRUD
// ---------------------------------------------------------------------------

/**
 * Retrieve all property schemes from SharePoint.
 */
async function getAllSchemes() {
    const responseData = await callFlow(SCHEMES_URL, 'POWER_AUTOMATE_SCHEMES_URL', {
        action: 'getAll'
    });

    const data = extractItems(responseData);
    data.sort((a, b) => Number(b.id) - Number(a.id));  // newest (highest ID) first
    return { data };
}

/**
 * Create a new property scheme in SharePoint.
 */
async function createScheme(data) {
    const { name, address, price, viewing_rules, description } = data;

    // Duplicate name check
    const { data: existing } = await getAllSchemes();
    const conflict = existing.some(s => (s.name || '').toLowerCase() === name.toLowerCase());
    if (conflict) {
        throw new Error('A scheme with this property name already exists.');
    }

    const responseData = await callFlow(SCHEMES_URL, 'POWER_AUTOMATE_SCHEMES_URL', {
        action: 'create',
        data: {
            name,
            address: address || '',
            price,
            viewing_rules: viewing_rules || '',
            description: description || ''
        }
    });

    const body = coerceBody(responseData);
    const item = body.item ?? body;
    return { scheme: { ...item, id: item.id ?? item.ID ?? item.Id } };
}

/**
 * Update an existing property scheme in SharePoint.
 */
async function updateScheme(id, data) {
    const schemeId = parseInt(id);
    const { name, address, price, viewing_rules, description } = data;

    const responseData = await callFlow(SCHEMES_URL, 'POWER_AUTOMATE_SCHEMES_URL', {
        action: 'update',
        id: schemeId,
        data: {
            name,
            address: address || '',
            price,
            viewing_rules: viewing_rules || '',
            description: description || ''
        }
    });

    const body = coerceBody(responseData);
    const item = body.item ?? { id: schemeId, ...data };
    return { scheme: { ...item, id: item.id ?? item.ID ?? item.Id ?? schemeId } };
}

/**
 * Delete a property scheme from SharePoint.
 */
async function deleteScheme(id) {
    const schemeId = parseInt(id);

    // Verify scheme exists before attempting delete
    const { data: existing } = await getAllSchemes();
    const target = existing.find(s => Number(s.id) === schemeId);
    if (!target) {
        throw new Error('Scheme not found.');
    }

    await callFlow(SCHEMES_URL, 'POWER_AUTOMATE_SCHEMES_URL', {
        action: 'delete',
        id: schemeId
    });

    return { scheme: target };
}

// ---------------------------------------------------------------------------
// Startup log
// ---------------------------------------------------------------------------
console.log('\n======================================================');
console.log('🚀 DATA LAYER: SharePoint via Power Automate');
console.log(`   Bookings flow : ${BOOKINGS_URL ? '✅ Configured' : '❌ MISSING — set POWER_AUTOMATE_BOOKINGS_URL'}`);
console.log(`   Schemes flow  : ${SCHEMES_URL ? '✅ Configured' : '❌ MISSING — set POWER_AUTOMATE_SCHEMES_URL'}`);
console.log('======================================================\n');

module.exports = {
    getAllBookings,
    createBooking,
    rescheduleBooking,
    deleteBooking,
    getStats,
    getAllSchemes,
    createScheme,
    updateScheme,
    deleteScheme
};