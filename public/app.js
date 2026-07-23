/**
 * Core Front-End Web Application Logic
 * Data source: SharePoint Lists via Node.js/Express → Power Automate HTTP flows.
 * All CRUD operations go through the backend API; no local storage fallback.
 */

let currentStep = 1;
const bookingData = {
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    booking_date: '',
    booking_time: '',
    visitor_count: 2
};
// -------------------------------------------------------------
// Booking form field validation (client-side, mirrors server rules)
// -------------------------------------------------------------
function validateBookingDetails(name, email, phone) {
    const errors = [];

    // Name: letters and spaces only (allows . ' - for names like O'Brien)
    if (!/^[A-Za-z .'-]+$/.test(name)) {
        errors.push("Name may contain only letters and spaces.");
    }

    // Email: must be a gmail.com address
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
        errors.push("Email must be a valid gmail.com address (e.g. name@gmail.com).");
    }

    // Phone: exactly 10 digits (spaces/dashes ignored)
    const phoneDigits = String(phone).replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(phoneDigits)) {
        errors.push("Phone number must be exactly 10 digits.");
    }

    return errors;
}

const timeSlots = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

let allBookings = [];
let currentRole = 'visitor';
let schemesCurrentPage = 1;
const SCHEMES_PER_PAGE = 5;
let visitorMap = null;
let visitorMapMarker = null;
let bookingSuccessMap = null;
let bookingSuccessMarker = null;
let selectedLocationSchemeName = '';

const DEFAULT_SCHEME_COORDS = {
    'open nest': { lat: 34.0736, lng: -118.4007 },
    'sunset cliffs estate': { lat: 34.0259, lng: -118.7798 },
    'horizon penthouse suite': { lat: 34.0522, lng: -118.2437 },
    'sakar onyx': { lat: 22.3168, lng: 73.2120 },
    'skyline grand towers': { lat: 22.2858, lng: 73.1611 },
    'lakeview signature homes': { lat: 22.3364, lng: 73.2081 },
    'royal crest villas': { lat: 22.3150, lng: 73.1180 },
    'emerald heights residency': { lat: 22.2902, lng: 73.1480 }
};

const LOCATION_KEYWORDS = [
    { keyword: 'sangam', lat: 22.3168, lng: 73.2120 },
    { keyword: 'akshar', lat: 22.2858, lng: 73.1611 },
    { keyword: 'harni', lat: 22.3364, lng: 73.2081 },
    { keyword: 'sevasi', lat: 22.3150, lng: 73.1180 },
    { keyword: 'vasna', lat: 22.2902, lng: 73.1480 },
    { keyword: 'vadodara', lat: 22.3072, lng: 73.1812 },
    { keyword: 'malibu', lat: 34.0259, lng: -118.7798 },
    { keyword: 'bel air', lat: 34.0736, lng: -118.4007 },
    { keyword: 'downtown', lat: 34.0522, lng: -118.2437 }
];

const GLOBAL_FALLBACK_COORDS = { lat: 22.3072, lng: 73.1812 };

const FALLBACK_DEFAULT_SCHEMES = [
    { id: 1, name: 'Open Nest', address: 'Bel Air Cliffs, Los Angeles, CA', price: '$18.5 Million', viewing_rules: 'Pre-cleared VIPs only', description: 'Our flagship 14,200 sq ft smart tech architectural mansion in Bel Air cliffs.', latitude: 34.0736, longitude: -118.4007 },
    { id: 2, name: 'Sunset Cliffs Estate', address: 'Pacific Coast Highway, Malibu, CA', price: '$12.4 Million', viewing_rules: 'Prior identification required', description: 'Breathtaking oceanfront estate featuring a private heated glass-bottom infinity pool.', latitude: 34.0259, longitude: -118.7798 },
    { id: 3, name: 'Horizon Penthouse Suite', address: 'Downtown LA Financial District, CA', price: '$6.9 Million', viewing_rules: 'Accompanied agents only', description: 'Sleek, high-elevation sky penthouse with modern automation and floor-to-ceiling glass.', latitude: 34.0522, longitude: -118.2437 },
    { id: 4, name: 'Sakar Onyx', address: 'Nr. Sangam Char Rasta, Vadodara', price: '₹10 Million', viewing_rules: 'Pre-approved visitors only', description: 'Premium residential flats.', latitude: 22.3168, longitude: 73.2120 },
    { id: 5, name: 'Skyline Grand Towers', address: 'Akshar Chowk, Vadodara', price: '₹11.9 Million', viewing_rules: 'Pre-approved visitors only', description: 'High-rise premium residences with panoramic city views.', latitude: 22.2858, longitude: 73.1611 }
];

let allSchemes = [...FALLBACK_DEFAULT_SCHEMES];

function getSchemeCoordinates(scheme) {
    if (!scheme) return { ...GLOBAL_FALLBACK_COORDS, isDefault: true };

    let lat = scheme.latitude !== undefined && scheme.latitude !== null && scheme.latitude !== '' ? parseFloat(scheme.latitude) : null;
    let lng = scheme.longitude !== undefined && scheme.longitude !== null && scheme.longitude !== '' ? parseFloat(scheme.longitude) : null;

    if (lat !== null && !isNaN(lat) && lng !== null && !isNaN(lng)) {
        return { lat, lng, isDefault: false };
    }

    const sName = (scheme.name || '').toLowerCase().trim();
    if (DEFAULT_SCHEME_COORDS[sName]) {
        return {
            lat: DEFAULT_SCHEME_COORDS[sName].lat,
            lng: DEFAULT_SCHEME_COORDS[sName].lng,
            isDefault: false
        };
    }

    const addr = (scheme.address || '').toLowerCase();
    for (const item of LOCATION_KEYWORDS) {
        if (addr.includes(item.keyword) || sName.includes(item.keyword)) {
            return { lat: item.lat, lng: item.lng, isDefault: false };
        }
    }

    return { ...GLOBAL_FALLBACK_COORDS, isDefault: true };
}

function formatCoordinates(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initDatePickers();
    initTheme();
    initRole();
    loadInitialData();
    setupNavigationListeners();
    setupScrollEffects();
    setupRoleDropdownCloseListener();
});

function initDatePickers() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 30);

    const tomString = tomorrow.toISOString().split('T')[0];
    const maxString = maxDate.toISOString().split('T')[0];

    const dateInput = document.getElementById('booking_date');
    const reschedInput = document.getElementById('reschedule-date');

    if (dateInput) {
        dateInput.min = tomString;
        dateInput.max = maxString;
        dateInput.value = tomString;
        bookingData.booking_date = tomString;
        dateInput.addEventListener('change', onDateChange);
    }

    if (reschedInput) {
        reschedInput.min = tomString;
        reschedInput.max = maxString;
    }
}

async function loadInitialData() {
    populateSchemesDropdown();
    renderSchemesTable();
    await refreshData();
    renderTimeSlots('booking_date', 'slots-container', 'selected_time');
}

function getOffsetDateString(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function setupNavigationListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            showSection(target);
        });
    });
}

function showSection(sectionId) {
    if (currentRole === 'visitor' && (sectionId === 'dashboard-section' || sectionId === 'admin-schemes-section' || sectionId === 'troubleshoot-section')) {
        sectionId = 'hero-section';
    }
    if (currentRole === 'admin' && sectionId === 'booking-section') {
        sectionId = 'dashboard-section';
    }

    document.querySelectorAll('.app-section').forEach(sec => {
        sec.classList.remove('active');
        if (sec.classList.contains('admin-only') && currentRole !== 'admin') {
            sec.style.display = 'none';
        } else if (sec.classList.contains('visitor-only') && currentRole !== 'visitor') {
            sec.style.display = 'none';
        } else {
            sec.style.display = '';
        }
    });

    const activeSec = document.getElementById(sectionId);
    if (activeSec) {
        activeSec.classList.add('active');
        activeSec.style.display = 'block';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-target') === sectionId) {
            link.classList.add('active');
        }
    });

    if (sectionId === 'dashboard-section') {
        refreshData();
    }

    if (sectionId === 'booking-section') {
        refreshSchemes();
    }

    if (sectionId === 'location-section') {
        updateLocationPage();
        requestAnimationFrame(() => {
            if (visitorMap) visitorMap.invalidateSize();
        });
    } else if (sectionId === 'troubleshoot-section') {
        setTimeout(() => runTroubleshootDiagnostic(), 200);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupScrollEffects() {
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('.glass-nav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
}

function onDateChange(e) {
    bookingData.booking_date = e.target.value;
    renderTimeSlots('booking_date', 'slots-container', 'selected_time');
}

function onRescheduleDateChange() {
    renderTimeSlots('reschedule-date', 'reschedule-slots-container', 'reschedule-selected-time');
}

function renderTimeSlots(dateInputId, containerId, hiddenInputId) {
    const dateVal = document.getElementById(dateInputId).value;
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (!dateVal || !container) return;

    container.innerHTML = '';
    hiddenInput.value = '';

    const bookedTimes = allBookings
        .filter(b => b.booking_date === dateVal && b.status !== 'Cancelled')
        .map(b => b.booking_time);

    timeSlots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'time-slot';

        const isBooked = bookedTimes.includes(slot);

        if (isBooked) {
            slotEl.classList.add('booked');
            slotEl.innerHTML = `<i class="fa-solid fa-lock"></i> ${slot}`;
        } else {
            slotEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${slot}`;
            slotEl.addEventListener('click', () => {
                container.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
                slotEl.classList.add('selected');
                hiddenInput.value = slot;
                if (hiddenInputId === 'selected_time') {
                    bookingData.booking_time = slot;
                }
            });
        }

        container.appendChild(slotEl);
    });
}

function nextStep(step) {
    if (step === 2) {
        const name = document.getElementById('visitor_name').value.trim();
        const email = document.getElementById('visitor_email').value.trim();
        const phone = document.getElementById('visitor_phone').value.trim();
        const scheme = document.getElementById('booking_scheme').value;

        // Required-field guard
        if (!name || !email || !phone || !scheme) {
            showToast("Missing Details", "Please fill in name, email, phone, and select a scheme.", "error");
            return;   // stay on step 1
        }

        // Format validation
        const errors = validateBookingDetails(name, email, phone);
        if (errors.length > 0) {
            showToast("Please Check Your Details", errors.join(' '), "error");
            return;   // stay on step 1, don't advance
        }

        bookingData.visitor_name = name;
        bookingData.visitor_email = email;
        bookingData.visitor_phone = phone.replace(/[\s-]/g, '');  // store clean digits
        bookingData.visitor_count = parseInt(document.getElementById('visitor_count').value);
        bookingData.scheme_name = scheme;
        selectedLocationSchemeName = scheme;
        updateLocationPage();
    }

    if (step === 3) {
        document.getElementById('sum-name').textContent = bookingData.visitor_name;
        document.getElementById('sum-count').textContent = bookingData.visitor_count;
        document.getElementById('sum-email').textContent = bookingData.visitor_email;
        document.getElementById('sum-phone').textContent = bookingData.visitor_phone;
        document.getElementById('sum-date').textContent = formatDate(bookingData.booking_date);
        document.getElementById('sum-time').textContent = bookingData.booking_time;
        document.getElementById('sum-scheme').textContent = bookingData.scheme_name || '-';
    }

    currentStep = step;
    updateStepUI();
}

function prevStep(step) {
    currentStep = step;
    updateStepUI();
}

function validateStep2AndContinue() {
    const timeVal = document.getElementById('selected_time').value;
    if (!timeVal) {
        showToast("Time Slot Required", "Please select a preferred viewing time slot before continuing.", "error");
        return;
    }
    nextStep(3);
}

function updateStepUI() {
    document.querySelectorAll('.booking-step').forEach(step => {
        step.classList.remove('active');
    });

    const activeStepEl = document.getElementById(`booking-step-${currentStep}`);
    if (activeStepEl) activeStepEl.classList.add('active');

    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        const line = document.getElementById(`step-line-${i - 1}`);

        if (dot) dot.className = 'step-indicator';
        if (line) line.className = 'step-line';

        if (i < currentStep) {
            if (dot) dot.classList.add('completed');
            if (line) line.classList.add('completed');
        } else if (i === currentStep) {
            if (dot) dot.classList.add('active');
        }
    }
}

async function refreshData() {
    try {
        await refreshSchemes();

        const bRes = await fetch('/api/bookings');
        const bookingsRes = await bRes.json();

        allBookings = bookingsRes.data || [];

        filterBookings();

    } catch (err) {
        console.error('Refresh operations failed', err);
        showToast("Sync Error", "Unable to load the latest data. Please try again.", "error");
    }
}

async function submitBooking() {
    const btnSubmit = document.getElementById('btn-submit-booking');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...`;

    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        });

        if (response.status === 409) throw new Error("This date and time slot is already booked.");
        if (!response.ok) throw new Error("Server submission error");

        document.getElementById('success-date-time').textContent =
            `${formatDate(bookingData.booking_date)} at ${bookingData.booking_time}`;
        currentStep = 'success';
        updateStepUI();
        showToast("Booking Successful", "Your viewing tour has been booked successfully.", "success");

        // Update success modal map for booked scheme
        const bookedScheme = allSchemes.find(s => (s.name || '').toLowerCase() === (bookingData.scheme_name || '').toLowerCase());
        const bookedCoords = getSchemeCoordinates(bookedScheme);

        setTimeout(() => {
            const successMapContainer = document.getElementById('booking-success-map');
            if (successMapContainer) {
                if (!bookingSuccessMap) {
                    bookingSuccessMap = L.map('booking-success-map', { zoomControl: false, attributionControl: false }).setView([bookedCoords.lat, bookedCoords.lng], 14);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(bookingSuccessMap);
                } else {
                    bookingSuccessMap.setView([bookedCoords.lat, bookedCoords.lng], 14);
                }
                if (bookingSuccessMarker) bookingSuccessMap.removeLayer(bookingSuccessMarker);
                bookingSuccessMarker = L.marker([bookedCoords.lat, bookedCoords.lng]).addTo(bookingSuccessMap)
                    .bindPopup(`<b>${escapeHtml(bookingData.scheme_name)}</b><br>${escapeHtml(bookedScheme ? bookedScheme.address : '')}`)
                    .openPopup();
                bookingSuccessMap.invalidateSize();
            }
        }, 150);

        await refreshData();

    } catch (err) {
        showToast("Booking Failed", err.message, "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> Book Private Tour`;
    }
}

function openRescheduleModal(id, date, time) {
    const modal = document.getElementById('reschedule-modal');
    document.getElementById('reschedule-booking-id').value = id;
    document.getElementById('reschedule-date').value = date;
    modal.classList.add('open');
    renderTimeSlots('reschedule-date', 'reschedule-slots-container', 'reschedule-selected-time');
}

function closeRescheduleModal() {
    document.getElementById('reschedule-modal').classList.remove('open');
}

async function submitReschedule() {
    const bookingId = document.getElementById('reschedule-booking-id').value;
    const newDate = document.getElementById('reschedule-date').value;
    const newTime = document.getElementById('reschedule-selected-time').value;
    const btnRes = document.getElementById('btn-confirm-reschedule');

    if (!newTime) {
        showToast("Time Required", "Please choose an available tour time slot.", "error");
        return;
    }

    btnRes.disabled = true;
    btnRes.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;

    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_date: newDate, booking_time: newTime })
        });

        if (response.status === 409) throw new Error("The selected new time slot is already booked.");
        if (!response.ok) throw new Error("Failed to reschedule viewing on server.");

        closeRescheduleModal();
        showToast("Tour Rescheduled", `Rescheduled to ${formatDate(newDate)} at ${newTime}.`, "success");
        await refreshData();

    } catch (err) {
        showToast("Reschedule Failed", err.message, "error");
    } finally {
        btnRes.disabled = false;
        btnRes.innerHTML = `Confirm Reschedule`;
    }
}

async function cancelBooking(id, name) {
    if (!confirm(`Are you sure you want to cancel the viewing tour scheduled for ${name}?`)) return;

    try {
        const response = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Server cancellation request failed.");

        showToast("Tour Cancelled", `Viewing tour for ${name} has been cancelled successfully.`, "info-theme");
        await refreshData();

    } catch (err) {
        showToast("Cancellation Failed", err.message, "error");
    }
}

function parseBookingDateTime(dateStr, timeStr) {
    if (!dateStr) return new Date(0);
    if (!timeStr) return new Date(`${dateStr}T23:59:59`);
    const match = String(timeStr).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) {
        const d = new Date(`${dateStr}T${timeStr}`);
        if (!isNaN(d.getTime())) return d;
        return new Date(`${dateStr}T23:59:59`);
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) {
        hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
    }

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return new Date(`${dateStr}T${hh}:${mm}:00`);
}

function updateDashboardStats(gridBookings) {
    const totalBookings = gridBookings.length;
    const totalVisitors = gridBookings.reduce((sum, b) => sum + (parseInt(b.visitor_count) || 0), 0);
    const upcomingTours = gridBookings.filter(b => b.status !== 'Cancelled').length;
    const cancelledTours = gridBookings.filter(b => b.status === 'Cancelled').length;

    const totalEl = document.getElementById('stat-total-bookings');
    const visitorsEl = document.getElementById('stat-total-visitors');
    const upcomingEl = document.getElementById('stat-upcoming');
    const cancelledEl = document.getElementById('stat-cancelled');

    if (totalEl) totalEl.textContent = totalBookings;
    if (visitorsEl) visitorsEl.textContent = totalVisitors;
    if (upcomingEl) upcomingEl.textContent = upcomingTours;
    if (cancelledEl) cancelledEl.textContent = cancelledTours;
}

function getFilteredBookings() {
    const now = new Date();
    const input = document.getElementById('search-input');
    const searchVal = input ? input.value.toLowerCase().trim() : '';

    // Only active and upcoming bookings (scheduled date/time >= current date/time)
    const activeUpcoming = allBookings.filter(b => {
        const dt = parseBookingDateTime(b.booking_date, b.booking_time);
        return dt >= now;
    });

    if (!searchVal) {
        return activeUpcoming;
    }

    return activeUpcoming.filter(b =>
        (b.visitor_name || '').toLowerCase().includes(searchVal) ||
        (b.visitor_email || '').toLowerCase().includes(searchVal) ||
        (b.visitor_phone || '').toLowerCase().includes(searchVal) ||
        (b.scheme_name || '').toLowerCase().includes(searchVal) ||
        (b.booking_date || '').includes(searchVal) ||
        (b.booking_time || '').toLowerCase().includes(searchVal) ||
        (b.status || '').toLowerCase().includes(searchVal)
    );
}

function renderBookingsTable(filteredBookings = getFilteredBookings()) {
    const tbody = document.getElementById('bookings-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    updateDashboardStats(filteredBookings);

    if (filteredBookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 10px; display:block; opacity: 0.5;"></i>
                    No viewing bookings match your search query.
                </td>
            </tr>
        `;
        return;
    }

    filteredBookings.forEach(booking => {
        const tr = document.createElement('tr');

        let badgeClass = 'badge-confirmed';
        if (booking.status === 'Rescheduled') badgeClass = 'badge-rescheduled';
        if (booking.status === 'Cancelled') badgeClass = 'badge-cancelled';

        const isCancelled = booking.status === 'Cancelled';

        tr.innerHTML = `
            <td>
                <strong>${formatDate(booking.booking_date)}</strong>
                <div class="input-helper">${booking.booking_time}</div>
            </td>
            <td><strong>${escapeHtml(booking.visitor_name)}</strong></td>
            <td>
                <div><i class="fa-solid fa-envelope text-muted" style="width:16px;"></i> ${escapeHtml(booking.visitor_email)}</div>
                <div class="input-helper"><i class="fa-solid fa-phone text-muted" style="width:16px;"></i> ${escapeHtml(booking.visitor_phone)}</div>
            </td>
            <td><span class="spec-tag">${booking.visitor_count} Guest/s</span></td>
            <td><span class="spec-tag" style="background: rgba(6, 182, 212, 0.08); border-color: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); font-weight: 600;">${escapeHtml(booking.scheme_name || 'Open Nest')}</span></td>
            <td><span class="status-badge ${badgeClass}">${booking.status}</span></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon btn-resched" title="Reschedule Tour"
                            onclick="openRescheduleModal(${booking.id}, '${booking.booking_date}', '${booking.booking_time}')"
                            ${isCancelled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button class="btn-icon btn-cancel" title="Cancel Tour"
                            onclick="cancelBooking(${booking.id}, '${escapeHtml(booking.visitor_name)}')"
                            ${isCancelled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function filterBookings() {
    renderBookingsTable(getFilteredBookings());
}



function resetBookingForm() {
    document.getElementById('details-form').reset();

    bookingData.visitor_name = '';
    bookingData.visitor_email = '';
    bookingData.visitor_phone = '';
    bookingData.visitor_count = 2;
    bookingData.scheme_name = '';

    refreshSchemes();
    initDatePickers();
    currentStep = 1;
    updateStepUI();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(parts[1]) - 1]} ${parts[2]}, ${parts[0]}`;
}

function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'info-theme') icon = 'fa-circle-info';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-info">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') return String(text);
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function initTheme() {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    document.body.className = savedTheme + '-theme';
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.className = newTheme + '-theme';
    localStorage.setItem('app-theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function initRole() {
    applyRoleVisibility();
}

function toggleRoleDropdown(event) {
    event.stopPropagation();
    const container = document.querySelector('.role-selector-container');
    if (container) container.classList.toggle('open');
}

function setupRoleDropdownCloseListener() {
    document.addEventListener('click', (e) => {
        const container = document.querySelector('.role-selector-container');
        if (container && container.classList.contains('open')) {
            if (!container.contains(e.target)) container.classList.remove('open');
        }
    });
}

function switchRole(role) {
    currentRole = role;

    const container = document.querySelector('.role-selector-container');
    if (container) container.classList.remove('open');

    const activeText = document.getElementById('active-role-text');
    const roleIcon = document.getElementById('role-icon');

    if (role === 'admin') {
        if (activeText) activeText.textContent = "Admin Role";
        if (roleIcon) roleIcon.className = "fa-solid fa-user-shield";
        document.getElementById('role-opt-admin').classList.add('active');
        document.getElementById('role-opt-visitor').classList.remove('active');
    } else {
        if (activeText) activeText.textContent = "Visitor Role";
        if (roleIcon) roleIcon.className = "fa-solid fa-user-circle";
        document.getElementById('role-opt-visitor').classList.add('active');
        document.getElementById('role-opt-admin').classList.remove('active');
    }

    applyRoleVisibility();

    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
        const target = activeLink.getAttribute('data-target');
        if (role === 'visitor' && (target === 'dashboard-section' || target === 'admin-schemes-section' || target === 'troubleshoot-section')) {
            showSection('hero-section');
        } else if (role === 'admin' && target === 'booking-section') {
            showSection('dashboard-section');
        }
    }
}

function applyRoleVisibility() {
    document.querySelectorAll('.nav-link.admin-only').forEach(link => {
        link.style.display = (currentRole === 'admin') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-link.visitor-only').forEach(link => {
        link.style.display = (currentRole === 'visitor') ? 'flex' : 'none';
    });

    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'admin') {
                el.style.display = 'none';
            } else {
                el.style.display = el.classList.contains('app-section') ? (el.classList.contains('active') ? 'block' : 'none') : '';
            }
        }
    });

    document.querySelectorAll('.visitor-only').forEach(el => {
        if (el.tagName !== 'A') {
            if (currentRole !== 'visitor') {
                el.style.display = 'none';
            } else {
                el.style.display = el.classList.contains('app-section') ? (el.classList.contains('active') ? 'block' : 'none') : '';
            }
        }
    });

    const reserveBtn = document.getElementById('header-reserve-btn');
    if (reserveBtn) reserveBtn.style.display = (currentRole === 'visitor') ? '' : 'none';

    if (typeof window.renderLogoutButton === 'function') {
        window.renderLogoutButton(currentRole === 'admin');
    }
}

// -------------------------------------------------------------
// Property Schemes Management System
// -------------------------------------------------------------
async function refreshSchemes() {
    try {
        const res = await fetch('/api/schemes');
        const schemesRes = await res.json();

        if (!res.ok) {
            console.warn('GET /api/schemes returned', res.status, '— details:', schemesRes.details || schemesRes.error);
        }

        const fetched = Array.isArray(schemesRes.data) && schemesRes.data.length > 0 ? schemesRes.data : [];
        if (fetched.length > 0) {
            allSchemes = fetched;
        } else if (!allSchemes || allSchemes.length === 0) {
            allSchemes = [...FALLBACK_DEFAULT_SCHEMES];
        }

        populateSchemesDropdown();
        renderSchemesTable();

    } catch (err) {
        console.error("Refresh schemes pipeline failed:", err);
        if (!allSchemes || allSchemes.length === 0) {
            allSchemes = [...FALLBACK_DEFAULT_SCHEMES];
        }
        populateSchemesDropdown();
        renderSchemesTable();
    }
}

function populateSchemesDropdown() {
    const dropdown = document.getElementById('booking_scheme');
    const locationDropdown = document.getElementById('location-scheme-select');

    const previousBookingValue = dropdown ? dropdown.value : '';
    const previousLocationValue = locationDropdown ? locationDropdown.value : '';

    if (dropdown) {
        dropdown.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = 'Select House Scheme / Property *';
        dropdown.appendChild(placeholder);

        allSchemes.forEach(s => {
            const option = document.createElement('option');
            option.value = s.name || '';
            option.textContent = `${s.name || 'Unknown'} (${s.price || 'N/A'})`;
            dropdown.appendChild(option);
        });

        if (previousBookingValue && allSchemes.some(s => s.name === previousBookingValue)) {
            dropdown.value = previousBookingValue;
        }
    }

    if (locationDropdown) {
        locationDropdown.innerHTML = '';
        if (!allSchemes || allSchemes.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No schemes available';
            locationDropdown.appendChild(opt);
        } else {
            allSchemes.forEach(s => {
                const option = document.createElement('option');
                option.value = s.name || '';
                option.textContent = `${s.name || 'Unknown'} — ${s.address || 'Address pending'} (${s.price || 'N/A'})`;
                locationDropdown.appendChild(option);
            });

            let schemeToSelect = selectedLocationSchemeName || previousLocationValue || (allSchemes[0] ? allSchemes[0].name : '');
            if (!allSchemes.some(s => s.name === schemeToSelect)) {
                schemeToSelect = allSchemes[0] ? allSchemes[0].name : '';
            }
            if (schemeToSelect) {
                locationDropdown.value = schemeToSelect;
                selectedLocationSchemeName = schemeToSelect;
            }
        }
    }

    try {
        updateLocationPage();
    } catch (e) {
        console.warn("Location update warning:", e);
    }
}

function onLocationSchemeSelectChange(schemeName) {
    selectedLocationSchemeName = schemeName;
    updateLocationPage();
}

function getActiveLocationScheme() {
    if (!allSchemes || allSchemes.length === 0) return null;
    let scheme = allSchemes.find(s => (s.name || '').toLowerCase() === (selectedLocationSchemeName || '').toLowerCase());
    if (!scheme) scheme = allSchemes[0];
    return scheme;
}

function updateLocationPage() {
    const scheme = getActiveLocationScheme();
    if (!scheme) return;

    selectedLocationSchemeName = scheme.name;

    const locSelect = document.getElementById('location-scheme-select');
    if (locSelect && locSelect.value !== scheme.name) {
        locSelect.value = scheme.name;
    }

    // Update Text Details
    const titleEl = document.getElementById('location-scheme-title');
    const addressEl = document.getElementById('location-scheme-address');
    const descEl = document.getElementById('location-scheme-desc');
    const badgesEl = document.getElementById('location-scheme-badges');
    const coordsEl = document.getElementById('location-coords');
    const travelEl = document.getElementById('location-travel-time');
    const statusContainer = document.getElementById('location-status-container');

    if (titleEl) titleEl.textContent = scheme.name || 'Property Estate';
    if (addressEl) {
        addressEl.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--accent-cyan); margin-right: 6px;"></i><span>${escapeHtml(scheme.address || 'Bel Air Cliffs, Los Angeles, CA')}</span>`;
    }
    if (descEl) {
        descEl.textContent = scheme.description || 'A private gated road access reserved strictly for scheduled visitors.';
    }

    const coords = getSchemeCoordinates(scheme);
    if (coordsEl) {
        coordsEl.textContent = formatCoordinates(coords.lat, coords.lng);
    }
    if (travelEl) {
        travelEl.textContent = scheme.address ? `Direct route to ${scheme.address}` : '25 mins from Vadodara Airport';
    }

    if (statusContainer) {
        if (coords.isDefault) {
            statusContainer.innerHTML = `<span class="status-badge" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); color: #F59E0B; font-size: 0.76rem;"><i class="fa-solid fa-triangle-exclamation"></i> Approximate Location</span>`;
        } else {
            statusContainer.innerHTML = `<span class="status-badge" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #10B981; font-size: 0.76rem;"><i class="fa-solid fa-circle-check"></i> Synchronized Coordinates</span>`;
        }
    }

    if (badgesEl) {
        badgesEl.innerHTML = `
            <span class="spec-tag" style="font-weight:600; color:var(--accent-cyan); border-color:rgba(6,182,212,0.25); background:rgba(6,182,212,0.08); padding: 4px 10px; font-size: 0.78rem;">
                <i class="fa-solid fa-tag"></i> ${escapeHtml(scheme.price || 'Custom Pricing')}
            </span>
            <span class="status-badge" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.25); color: var(--accent-violet); font-size: 0.78rem; padding: 4px 10px;">
                <i class="fa-solid fa-shield-halved"></i> ${escapeHtml(scheme.viewing_rules || 'Pre-cleared Access')}
            </span>
        `;
    }

    initVisitorMap(coords, scheme);
}

function reserveSelectedLocationScheme() {
    const scheme = getActiveLocationScheme();
    if (scheme) {
        const bookingSelect = document.getElementById('booking_scheme');
        if (bookingSelect && Array.from(bookingSelect.options).some(o => o.value === scheme.name)) {
            bookingSelect.value = scheme.name;
            bookingData.scheme_name = scheme.name;
        }
    }
    showSection('booking-section');
}

// Returns schemes matching the search box (name, address, price, restrictions, description)
function getFilteredSchemes() {
    const input = document.getElementById('schemes-search-input');
    const q = input ? input.value.toLowerCase().trim() : '';
    if (!q) return allSchemes;
    return allSchemes.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        String(s.price || '').toLowerCase().includes(q) ||
        (s.viewing_rules || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
}

function renderSchemesTable() {
    const tbody = document.getElementById('schemes-tbody');
    if (!tbody) return;

    const list = getFilteredSchemes();
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / SCHEMES_PER_PAGE));

    if (schemesCurrentPage > totalPages) schemesCurrentPage = totalPages;
    if (schemesCurrentPage < 1) schemesCurrentPage = 1;

    tbody.innerHTML = '';

    if (total === 0) {
        const searchInput = document.getElementById('schemes-search-input');
        const searching = !!(searchInput && searchInput.value.trim());
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-muted">
                    ${searching
                ? 'No schemes match your search criteria.'
                : 'No property schemes available.'}
                </td>
            </tr>
        `;
        renderSchemesPagination(0, totalPages, 0, 0);
        return;
    }

    const start = (schemesCurrentPage - 1) * SCHEMES_PER_PAGE;
    const end = Math.min(start + SCHEMES_PER_PAGE, total);

    list.slice(start, end).forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>
                    <i class="fa-solid fa-building" style="color: var(--accent-violet); margin-right: 6px; font-size: 0.85em;"></i>
                    ${escapeHtml(s.name || '')}
                </strong>
            </td>
            <td>
                <span class="text-muted">
                    <i class="fa-solid fa-location-dot" style="color: var(--accent-cyan); margin-right: 6px; font-size: 0.85em;"></i>
                    ${escapeHtml(s.address || 'Address pending')}
                </span>
            </td>
            <td>
                <span style="font-weight: 600; color: var(--text-primary);">
                    <i class="fa-solid fa-tag" style="color: var(--accent-cyan); margin-right: 5px; font-size: 0.85em;"></i>
                    ${escapeHtml(s.price || 'N/A')}
                </span>
            </td>
            <td>
                <span style="font-size: 0.84rem; color: var(--text-secondary);">
                    <i class="fa-solid fa-shield-halved" style="color: var(--accent-violet); margin-right: 5px; font-size: 0.85em;"></i>
                    ${escapeHtml(s.viewing_rules || 'Standard rules')}
                </span>
            </td>
            <td><div class="input-helper" style="white-space: normal; line-height: 1.4; font-size: 0.82rem; color: var(--text-secondary); max-width: 260px;">${escapeHtml(s.description || '-')}</div></td>
        `;
        tbody.appendChild(tr);
    });

    renderSchemesPagination(total, totalPages, start, end);
}

function openEditSchemeModal(id) {
    const scheme = allSchemes.find(s => String(s.id) === String(id));
    if (!scheme) return;

    document.getElementById('edit-scheme-id').value = scheme.id;
    document.getElementById('edit-scheme-name').value = scheme.name || '';
    document.getElementById('edit-scheme-address').value = scheme.address || '';
    document.getElementById('edit-scheme-lat').value = scheme.latitude || '';
    document.getElementById('edit-scheme-lng').value = scheme.longitude || '';
    document.getElementById('edit-scheme-price').value = scheme.price || '';
    document.getElementById('edit-scheme-rules').value = scheme.viewing_rules || '';
    document.getElementById('edit-scheme-desc').value = scheme.description || '';

    const modal = document.getElementById('edit-scheme-modal');
    if (modal) modal.classList.add('open');
}

function closeEditSchemeModal() {
    const modal = document.getElementById('edit-scheme-modal');
    if (modal) modal.classList.remove('open');
}

async function submitEditScheme(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('edit-scheme-id').value;
    const name = document.getElementById('edit-scheme-name').value.trim();
    const address = document.getElementById('edit-scheme-address').value.trim();
    const latitude = document.getElementById('edit-scheme-lat').value.trim();
    const longitude = document.getElementById('edit-scheme-lng').value.trim();
    const price = document.getElementById('edit-scheme-price').value.trim();
    const viewing_rules = document.getElementById('edit-scheme-rules').value.trim();
    const description = document.getElementById('edit-scheme-desc').value.trim();

    if (!name || !price || !address) {
        showToast("Validation Error", "Name, address, and price are required.", "error");
        return;
    }

    const btnSubmit = document.getElementById('btn-confirm-edit-scheme');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;
    }

    try {
        const response = await fetch(`/api/schemes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address, latitude, longitude, price, viewing_rules, description })
        });

        if (!response.ok) throw new Error("Failed to update property scheme.");

        closeEditSchemeModal();
        showToast("Scheme Updated", `Property scheme "${name}" updated successfully.`, "success");
        await refreshSchemes();
    } catch (err) {
        showToast("Update Failed", err.message, "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `Save Changes`;
        }
    }
}

async function deleteScheme(id, name) {
    if (!confirm(`Are you sure you want to delete the property scheme "${name}"?`)) return;

    try {
        const response = await fetch(`/api/schemes/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Server failed to delete scheme.");

        showToast("Scheme Deleted", `Property scheme "${name}" has been deleted.`, "info-theme");
        await refreshSchemes();
    } catch (err) {
        showToast("Delete Failed", err.message, "error");
    }
}

function renderSchemesPagination(total, totalPages, start, end) {
    const info = document.getElementById('schemes-page-info');
    const controls = document.getElementById('schemes-page-controls');

    if (info) {
        info.textContent = total === 0 ? 'No schemes to show' : `Showing ${start + 1}\u2013${end} of ${total} schemes`;
    }
    if (!controls) return;

    controls.innerHTML = '';
    if (totalPages <= 1) return; // no controls needed for a single page

    const makeBtn = (label, page, opts = {}) => {
        const b = document.createElement('button');
        b.className = 'page-btn' + (opts.active ? ' active' : '');
        b.innerHTML = label;
        if (opts.disabled) b.disabled = true;
        else b.onclick = () => changeSchemesPage(page);
        return b;
    };

    controls.appendChild(makeBtn('<i class="fa-solid fa-chevron-left"></i>', schemesCurrentPage - 1, { disabled: schemesCurrentPage === 1 }));
    for (let p = 1; p <= totalPages; p++) {
        controls.appendChild(makeBtn(String(p), p, { active: p === schemesCurrentPage }));
    }
    controls.appendChild(makeBtn('<i class="fa-solid fa-chevron-right"></i>', schemesCurrentPage + 1, { disabled: schemesCurrentPage === totalPages }));
}

function changeSchemesPage(page) {
    schemesCurrentPage = page;
    renderSchemesTable();
}

function filterSchemes() {
    schemesCurrentPage = 1; // jump back to the first page on every new search
    renderSchemesTable();
}

async function submitScheme(e) {
    e.preventDefault();

    const nameInput = document.getElementById('scheme_name_input');
    const addressInput = document.getElementById('scheme_address_input');
    const latInput = document.getElementById('scheme_lat_input');
    const lngInput = document.getElementById('scheme_lng_input');
    const priceInput = document.getElementById('scheme_price_input');
    const rulesInput = document.getElementById('scheme_rules_input');
    const descInput = document.getElementById('scheme_desc_input');
    const btnSubmit = document.getElementById('btn-submit-scheme');

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();
    const latitude = latInput ? latInput.value.trim() : '';
    const longitude = lngInput ? lngInput.value.trim() : '';
    const price = priceInput.value.trim();
    const viewing_rules = rulesInput.value.trim();
    const description = descInput.value.trim();

    if (!name || !price || !address) {
        showToast("Validation Error", "Property scheme name, address, and pricing label are required fields.", "error");
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Registering...`;

    try {
        const response = await fetch('/api/schemes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address, latitude, longitude, price, viewing_rules, description })
        });

        if (response.status === 409) throw new Error("A scheme with this property name already exists.");
        if (!response.ok) throw new Error("Server rejected property scheme insertion.");

        showToast("Scheme Added", `Property "${name}" has been added successfully.`, "success");
        document.getElementById('scheme-creation-form').reset();

        await refreshSchemes();

    } catch (err) {
        showToast("Creation Failed", err.message, "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Create New Scheme`;
    }
}

function initVisitorMap(coordsOverride, schemeOverride) {
    const container = document.getElementById('visitor-map');
    if (!container) return;

    const scheme = schemeOverride || getActiveLocationScheme();
    const coords = coordsOverride || getSchemeCoordinates(scheme);
    const targetLatLng = [coords.lat, coords.lng];

    if (!visitorMap) {
        visitorMap = L.map('visitor-map', {
            zoomControl: true,
            attributionControl: true,
            fadeAnimation: false,
            zoomAnimation: true
        }).setView(targetLatLng, 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(visitorMap);
    } else {
        visitorMap.setView(targetLatLng, 15, { animate: false });
    }

    if (visitorMapMarker) {
        visitorMap.removeLayer(visitorMapMarker);
    }

    const popupHtml = `
        <div style="font-family: 'Outfit', sans-serif; color: #1e293b; padding: 6px; min-width: 180px;">
            <h5 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #0f172a;">${escapeHtml(scheme ? scheme.name : 'Open Nest Estate')}</h5>
            <p style="margin: 0 0 6px 0; font-size: 11px; color: #475569; line-height: 1.3;">${escapeHtml(scheme ? scheme.address : 'Bel Air, Los Angeles, CA')}</p>
            <div style="font-size: 11px; font-weight: 600; color: #7c3aed; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; display: inline-block;">
                ${escapeHtml(scheme ? scheme.price : '')}
            </div>
        </div>
    `;

    visitorMapMarker = L.marker(targetLatLng).addTo(visitorMap).bindPopup(popupHtml);
    visitorMapMarker.openPopup();

    requestAnimationFrame(() => {
        if (visitorMap) {
            visitorMap.invalidateSize();
        }
    });
}

let tsLastSyncTime = null;

async function runTroubleshootDiagnostic() {
    setTsStatus('backend', 'checking', 'Checking...');
    setTsStatus('bookings', 'checking', 'Checking...');
    setTsStatus('schemes', 'checking', 'Checking...');

    try {
        const r = await fetch('/api/stats');
        if (r.ok) {
            setTsStatus('backend', 'ok', 'Online');
        } else {
            throw new Error(`HTTP ${r.status}`);
        }
    } catch (e) {
        setTsStatus('backend', 'error', 'Offline / Unreachable');
        tsLogError('Backend server unreachable', e.message, 'Try restarting the Node.js server with `npm start`. Verify POWER_AUTOMATE_BOOKINGS_URL and POWER_AUTOMATE_SCHEMES_URL are set in .env');
    }

    try {
        const r = await fetch('/api/bookings');
        if (r.ok) {
            setTsStatus('bookings', 'ok', 'Responding');
        } else {
            throw new Error(`HTTP ${r.status}`);
        }
    } catch (e) {
        setTsStatus('bookings', 'error', 'API Error');
        tsLogError('/api/bookings failed', e.message, 'Check that POWER_AUTOMATE_BOOKINGS_URL is set in .env and the flow supports action: "getAll"');
    }

    try {
        const r = await fetch('/api/schemes');
        const body = await r.json();
        if (r.ok && Array.isArray(body.data)) {
            setTsStatus('schemes', 'ok', `Responding (${body.data.length} schemes)`);
        } else {
            throw new Error(body.details || body.error || `HTTP ${r.status}`);
        }
    } catch (e) {
        setTsStatus('schemes', 'error', 'API Error');
        tsLogError('/api/schemes failed', e.message, 'Check that POWER_AUTOMATE_SCHEMES_URL is set in .env and the flow supports action: "getAll"');
    }

    updateTsSysInfo();

    tsLastSyncTime = new Date();
    document.getElementById('ts-info-sync').textContent = tsLastSyncTime.toLocaleTimeString();
}

function setTsStatus(service, state, text) {
    const badge = document.getElementById(`ts-${service}-badge`);
    const icon = document.getElementById(`ts-${service}-icon`);
    if (!badge) return;

    badge.textContent = text;
    badge.className = 'ts-badge';
    if (state === 'ok') badge.classList.add('ts-badge-ok');
    else if (state === 'warn') badge.classList.add('ts-badge-warn');
    else if (state === 'error') badge.classList.add('ts-badge-error');
    else badge.classList.add('ts-badge-checking');

    if (icon) {
        icon.className = 'ts-status-icon';
        if (state === 'ok') icon.classList.add('ts-icon-ok');
        else if (state === 'warn') icon.classList.add('ts-icon-warn');
        else if (state === 'error') icon.classList.add('ts-icon-error');
    }
}

function tsLogError(title, detail, fix) {
    const log = document.getElementById('ts-error-log');
    if (!log) return;

    const empty = log.querySelector('.ts-log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = 'ts-log-entry';
    entry.innerHTML = `
        <div class="ts-log-header">
            <i class="fa-solid fa-circle-exclamation" style="color: var(--accent-pink);"></i>
            <strong>${escapeHtml(title)}</strong>
            <span class="ts-log-time">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="ts-log-detail">${escapeHtml(detail)}</div>
        ${fix ? `<div class="ts-log-fix"><i class="fa-solid fa-lightbulb" style="color: var(--accent-cyan); margin-right:5px;"></i>${escapeHtml(fix)}</div>` : ''}
    `;
    log.prepend(entry);
}

function clearTsLog() {
    const log = document.getElementById('ts-error-log');
    if (!log) return;
    log.innerHTML = `
        <div class="ts-log-empty">
            <i class="fa-solid fa-circle-check" style="color: var(--accent-cyan); font-size:2rem; margin-bottom:10px;"></i>
            <p>Error log cleared. System appears healthy.</p>
        </div>
    `;
}



function updateTsSysInfo() {
    const modeEl = document.getElementById('ts-info-mode');
    const bookingsEl = document.getElementById('ts-info-bookings');
    const schemesEl = document.getElementById('ts-info-schemes');
    const lsEl = document.getElementById('ts-info-ls');
    const browserEl = document.getElementById('ts-info-browser');

    if (modeEl) modeEl.textContent = 'SharePoint via Power Automate';
    if (bookingsEl) bookingsEl.textContent = allBookings.length;
    if (schemesEl) schemesEl.textContent = allSchemes.length;

    if (lsEl) {
        let lsSize = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) lsSize += localStorage[key].length * 2;
        }
        lsEl.textContent = lsSize < 1024 ? `${lsSize} B` : `${(lsSize / 1024).toFixed(1)} KB`;
    }

    if (browserEl) {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Google Chrome';
        else if (ua.includes('Firefox')) browser = 'Mozilla Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Apple Safari';
        else if (ua.includes('Edg')) browser = 'Microsoft Edge';
        browserEl.textContent = browser;
    }
}

function tsFixClearLocalStorage() {
    clearTsLog();
    showToast('Log Cleared', 'Diagnostic log cleared.', 'success');
}

function tsFixReseedData() {
    refreshData();
    showToast('Data Refreshed', 'Fetching latest data from SharePoint.', 'success');
}

async function tsFixReconnect() {
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            showToast('Connected', 'Backend server is reachable. Refreshing data from SharePoint.', 'success');
            refreshData();
        } else {
            throw new Error(`Server responded with HTTP ${res.status}`);
        }
    } catch (e) {
        showToast('Reconnect Failed', 'Backend server unreachable.', 'error');
        tsLogError('Reconnect attempt failed', e.message, 'Make sure the Node.js server is running: npm start');
    }
    runTroubleshootDiagnostic();
}

function tsFixExportData() {
    const exportData = {
        exportedAt: new Date().toISOString(),
        mode: 'SharePoint via Power Automate',
        bookings: allBookings,
        schemes: allSchemes
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opennest-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export Complete', 'Data exported as JSON file.', 'success');
}