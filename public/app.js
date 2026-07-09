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
    visitor_count: 2,
    special_requests: ''
};

const timeSlots = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

let allBookings = [];
let currentRole = 'visitor';
let allSchemes = [];
let schemesCurrentPage = 1;
const SCHEMES_PER_PAGE = 5;
let visitorMap = null;
let adminMap = null;
const estateCoords = [18.9543, 72.8088];

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
        setTimeout(() => {
            initVisitorMap();
            if (visitorMap) visitorMap.invalidateSize();
        }, 100);
    } else if (sectionId === 'dashboard-section') {
        setTimeout(() => {
            initAdminMap();
            if (adminMap) adminMap.invalidateSize();
        }, 100);
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
        bookingData.visitor_name = document.getElementById('visitor_name').value.trim();
        bookingData.visitor_email = document.getElementById('visitor_email').value.trim();
        bookingData.visitor_phone = document.getElementById('visitor_phone').value.trim();
        bookingData.visitor_count = parseInt(document.getElementById('visitor_count').value);
        bookingData.scheme_name = document.getElementById('booking_scheme').value;
    }

    if (step === 3) {
        bookingData.special_requests = document.getElementById('special_requests').value.trim();
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

        const [bRes, sRes] = await Promise.all([
            fetch('/api/bookings'),
            fetch('/api/stats')
        ]);

        const bookingsRes = await bRes.json();
        const statsRes = await sRes.json();

        allBookings = bookingsRes.data || [];

        document.getElementById('stat-total-bookings').textContent = statsRes.stats.totalBookings;
        document.getElementById('stat-total-visitors').textContent = statsRes.stats.totalVisitors;
        document.getElementById('stat-upcoming').textContent = statsRes.stats.upcomingTours;
        document.getElementById('stat-cancelled').textContent = statsRes.stats.cancelledBookings;

        renderBookingsTable();

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

function renderBookingsTable(filteredBookings = allBookings) {
    const tbody = document.getElementById('bookings-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

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

        const requestsStr = booking.special_requests
            ? (booking.special_requests.length > 50 ? booking.special_requests.substring(0, 47) + '...' : booking.special_requests)
            : '<span class="text-muted">None</span>';

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
            <td title="${escapeHtml(booking.special_requests || '')}">${escapeHtml(requestsStr)}</td>
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
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();

    if (!searchVal) {
        renderBookingsTable(allBookings);
        return;
    }

    const filtered = allBookings.filter(b =>
        b.visitor_name.toLowerCase().includes(searchVal) ||
        b.visitor_email.toLowerCase().includes(searchVal) ||
        b.booking_date.includes(searchVal) ||
        (b.special_requests && b.special_requests.toLowerCase().includes(searchVal))
    );

    renderBookingsTable(filtered);
}



function resetBookingForm() {
    document.getElementById('details-form').reset();
    document.getElementById('special_requests').value = '';

    bookingData.visitor_name = '';
    bookingData.visitor_email = '';
    bookingData.visitor_phone = '';
    bookingData.visitor_count = 2;
    bookingData.special_requests = '';
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

        allSchemes = Array.isArray(schemesRes.data) ? schemesRes.data : [];

        populateSchemesDropdown();
        renderSchemesTable();

    } catch (err) {
        console.error("Refresh schemes pipeline failed:", err);
        allSchemes = [];
        populateSchemesDropdown();
        renderSchemesTable();
        showToast("Unable to Load Schemes", "Unable to load property schemes. Please try again.", "error");
    }
}

function populateSchemesDropdown() {
    const dropdown = document.getElementById('booking_scheme');
    if (!dropdown) return;

    const previousValue = dropdown.value;

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

    if (previousValue && allSchemes.some(s => s.name === previousValue)) {
        dropdown.value = previousValue;
    }
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

    // keep the current page in range (e.g. after deleting or filtering)
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
                : 'No active property viewing tiers mapped in database.'}
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
            <td><strong>${escapeHtml(s.name || '')}</strong></td>
            <td><span class="text-muted"><i class="fa-solid fa-location-dot" style="margin-right: 4px; font-size: 0.85em;"></i>${escapeHtml(s.address || 'Address not provided')}</span></td>
            <td><span class="spec-tag" style="font-weight:600; color:var(--accent-cyan); border-color:rgba(6,182,212,0.25); background:rgba(6,182,212,0.06);">${escapeHtml(s.price || '')}</span></td>
            <td>
                <span class="status-badge" style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); color: var(--accent-violet); font-size: 0.78rem;">
                    <i class="fa-solid fa-shield-halved" style="font-size:0.75rem; margin-right:3px;"></i> ${escapeHtml(s.viewing_rules || 'Pre-cleared VIPs')}
                </span>
            </td>
            <td><div class="input-helper" style="white-space: normal; line-height: 1.4; font-size:0.8rem; color:var(--text-secondary); max-width:280px;">${escapeHtml(s.description || 'Exclusive accompanied tour tier.')}</div></td>
        `;
        tbody.appendChild(tr);
    });

    renderSchemesPagination(total, totalPages, start, end);
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
    const priceInput = document.getElementById('scheme_price_input');
    const rulesInput = document.getElementById('scheme_rules_input');
    const descInput = document.getElementById('scheme_desc_input');
    const btnSubmit = document.getElementById('btn-submit-scheme');

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();
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
            body: JSON.stringify({ name, address, price, viewing_rules, description })
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

function initVisitorMap() {
    if (visitorMap) return;
    const container = document.getElementById('visitor-map');
    if (!container) return;

    visitorMap = L.map('visitor-map', { zoomControl: true, attributionControl: true }).setView(estateCoords, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(visitorMap);

    L.marker(estateCoords).addTo(visitorMap).bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; color: #1e293b; padding: 4px;">
            <h5 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Open Nest Estate</h5>
            <p style="margin: 0; font-size: 11px; color: #64748b;">Malabar Hill, Mumbai, Maharashtra 400006</p>
        </div>
    `).openPopup();
}

function initAdminMap() {
    if (adminMap) return;
    const container = document.getElementById('admin-map');
    if (!container) return;

    adminMap = L.map('admin-map', { zoomControl: true, attributionControl: true }).setView(estateCoords, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(adminMap);

    L.marker(estateCoords).addTo(adminMap).bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; color: #1e293b; padding: 4px;">
            <h5 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Open Nest Estate</h5>
            <p style="margin: 0; font-size: 11px; color: #64748b;">Malabar Hill, Mumbai, Maharashtra 400006</p>
        </div>
    `).openPopup();
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