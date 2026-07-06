-- ====================================================================
-- OPEN NEST VISITOR BOOKING SYSTEM - DATABASE CREATION & SCHEMA SCRIPT
-- Backend: MySQL Database
-- Project: Open Nest Private Viewings & House Schemes
-- ====================================================================

-- 1. Create the Database (Optional / For Reference)
-- CREATE DATABASE IF NOT EXISTS HouseViewingDB;
-- USE HouseViewingDB;

-- 2. Drop existing tables if they exist (in correct dependency order)
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS schemes;

-- 3. Create the schemes Table
CREATE TABLE schemes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(250) NULL,
    price VARCHAR(50) NOT NULL,
    viewing_rules VARCHAR(250) NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create the bookings Table (with Scheme relationship mapping)
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    visitor_name VARCHAR(150) NOT NULL,
    visitor_email VARCHAR(150) NOT NULL,
    visitor_phone VARCHAR(50) NOT NULL,
    booking_date DATE NOT NULL,
    booking_time VARCHAR(50) NOT NULL,            -- e.g., "10:00 AM", "02:30 PM"
    visitor_count INT NOT NULL DEFAULT 1,
    scheme_name VARCHAR(100) NOT NULL,            -- Associated House Scheme
    special_requests VARCHAR(500) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Confirmed', -- 'Confirmed', 'Rescheduled', 'Cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create Indexes for fast querying on common filter conditions
CREATE INDEX IX_bookings_date_time ON bookings(booking_date, booking_time);
CREATE INDEX IX_bookings_email ON bookings(visitor_email);

-- 6. Seed initial house schemes
INSERT INTO schemes (name, address, price, viewing_rules, description)
VALUES
('Open Nest', 'Bel Air Cliffs, Los Angeles, CA', '$18.5 Million', 'Pre-cleared VIPs only', 'Our flagship 14,200 sq ft smart tech architectural mansion in Bel Air cliffs.'),
('Sunset Cliffs Estate', 'Pacific Coast Highway, Malibu, CA', '$12.4 Million', 'Prior identification required', 'Breathtaking oceanfront estate featuring a private heated glass-bottom infinity pool.'),
('Horizon Penthouse Suite', 'Downtown LA Financial District, CA', '$6.9 Million', 'Accompanied agents only', 'Sleek, high-elevation sky penthouse with modern automation and floor-to-ceiling glass.');

-- 7. Seed initial booking records
INSERT INTO bookings (visitor_name, visitor_email, visitor_phone, booking_date, booking_time, visitor_count, scheme_name, special_requests, status)
VALUES 
('Evelyn Mercer', 'evelyn.mercer@example.com', '+1 (555) 234-5678', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00 AM', 2, 'Open Nest', 'Would love to see the master bedroom layout and pool automation panel.', 'Confirmed'),
('Julian Vance', 'julian.vance@example.com', '+1 (555) 876-5432', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '02:00 PM', 1, 'Sunset Cliffs Estate', 'Interested in the solar integration and smart home system.', 'Confirmed'),
('Marcus Vance', 'marcus@example.com', '+1 (555) 999-8888', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '11:30 AM', 3, 'Horizon Penthouse Suite', 'Need accessibility answers for wheelchair entrance.', 'Confirmed');

-- 8. Verify schema initialization
SELECT * FROM schemes;
SELECT * FROM bookings;
