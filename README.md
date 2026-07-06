# Open Nest  - Private Viewing Booking Application

Welcome to the **Grand Horizon Villa Private Viewing Booking Portal**—a state-of-the-art web application featuring a stunning modern **Glassmorphism dark-mode theme**, custom floating glow animations, responsive scheduling filters, and integration with **Microsoft SQL Server (MS SQL)**.

Designed with absolute visual excellence, this portal offers potential buyers or visitors a premium booking experience, while providing property managers or real estate agents a robust real-time management dashboard.

---

## ✨ Features & Aesthetic System

### 🎨 Design System (Aesthetics)
- **Glassmorphism Theme**: Fully-realized frosted glass cards using high-performance CSS backdrop filters (`backdrop-filter: blur(18px) saturate(180%)`), glowing border frames, and dynamic shadow structures.
- **Dynamic Organic Glowing Backdrops**: Colorful blur background blobs that gently float and breathe, giving the application a responsive, modern, premium depth.
- **Micro-Animations & Ripple Highlights**: Glowing state hover effects, floating select grids, dynamic toast indicators, and smooth step-by-step navigation transitions.
- **Responsive Layout**: Designed to adapt perfectly from desktop monitors to tablets and mobile screens.

### 📅 Booking Portal Wizard
- **Multi-Step Form Flow**: Intuitively designed progress wizard: `Visitor Details` ➔ `Date & Time Slots` ➔ `Special Tour Requests`.
- **Intelligent Time Slot Allocator**: Real-time checking to dynamically block and lock booked time slots, preventing double-bookings.
- **Comprehensive Scheduling Constraints**: Restricts booking date picker from tomorrow up to 30 days in advance.

### 📊 Real-Time Status Dashboard
- **Live Statistics Indicators**: High-performance stats counters showing: *Total Bookings*, *Total Expected Visitors*, *Upcoming Viewings*, and *Cancelled Tours*.
- **Live Booking Table Grid**: Lists all viewings in clear priority date order with status badges (Confirmed 🟢, Rescheduled 🟡, Cancelled 🔴).
- **Search & Filters**: Real-time text search and filter capability across names, dates, emails, or custom special requests.
- **Inline Controls**: Instant rescheduling modal triggers and soft cancellation actions directly inside each row.

### 💻 MS SQL Server Audit Log Console (Floating Dock)
- **Real-Time Visual Queries**: An interactive drawer console that dynamically displays the **exact parameterized SQL query** being constructed and executed on the backend database for every single user operation (Booking, Rescheduling, Cancelling, Querying).
- **Syntax Highlighting**: Custom color formatting applied to SQL Keywords, Strings, Numbers, and Comments to enhance visual auditing.
- **Engine Flagging**: Displays the exact active database driver mode (Microsoft SQL Server vs. Local Simulation).
- **Copy Trigger**: Instant one-click clipboard copying.

---

## 🛠️ Technology Stack
- **Frontend**: Clean modern Semantic HTML5, advanced Vanilla CSS3, custom ES6 Javascript. (Zero bloated UI library files).
- **Icons & Typography**: Outfit Heading Font, Plus Jakarta Sans Body Font, FontAwesome CDN Icons.
- **Backend Framework**: Node.js & Express (with REST API routing).
- **Database Engine**: Microsoft SQL Server (via official npm `mssql` client driver).
- **Intelligent Local Failover**: Incorporates an automatic fallback system. If MS SQL Server is not running or env configurations are missing, it operates in **Standalone Local Mode** (using `bookings_db.json` on the backend, or browser `localStorage` offline), keeping 100% of features interactive with simulated SQL logging.

---

## 🚀 Getting Started

Since Node and NPM may not be added to your Windows system path by default, we have provided two incredibly simple methods to run the application:

### Method A: Standalone Browser Mode (Zero Setup - Recommended First Step)
Simply open the `public/index.html` file in any modern web browser (Double-click the file on Windows or drag it into Chrome/Edge).
- **How it works**: The frontend will automatically detect that the Node.js server is offline and spin up the **Standalone Client SQL Simulator**.
- **Result**: You can book, reschedule, cancel, search, and view statistics immediately! The **MS SQL Server Audit Log Console** will light up and show you the exact SQL queries generated behind the scenes in real time.

---

### Method B: Full Node.js Backend with MS SQL Server Connection
To connect the application to a real Microsoft SQL Server instance, follow these steps:

#### 1. Setup the Database Schema
Open your preferred SQL Server management tool (such as **SSMS** or Azure Data Studio), connect to your SQL Server instance, and execute the creation script:
- Copy the content of [schema.sql](file:///C:/Users/Aniket.Desai/.gemini/antigravity/scratch/visitor-booking-app/schema.sql) and run it.
- This creates the database `HouseViewingDB`, defines the `bookings` table, generates structural indexing for email/date searches, and seeds initial luxury bookings.

#### 2. Configure Environment Variables
Inside the project folder, open the `.env` configuration file and fill in your connection credentials:
```ini
PORT=3000
DB_USER=your_sql_username
DB_PASSWORD=your_sql_password
DB_SERVER=localhost
DB_DATABASE=HouseViewingDB
DB_PORT=1433
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
```

#### 3. Install Dependencies & Launch
In your terminal/Command Prompt, navigate to the folder and run:
```bash
# Install Express and MS SQL packages
npm install

# Start the web server
npm start
```
Open **`http://localhost:3000`** in your browser. The application console will output a successful SQL connection and run directly using your Microsoft SQL Server database!

---

## 🗃️ DB Table Schema Reference (`bookings`)

| Column Name | Data Type | Constraint | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INT` | IDENTITY PRIMARY KEY | Auto-incrementing identifier |
| `visitor_name` | `NVARCHAR(150)` | NOT NULL | Full name of the tour visitor |
| `visitor_email` | `NVARCHAR(150)` | NOT NULL | Email contact of the visitor |
| `visitor_phone` | `NVARCHAR(50)` | NOT NULL | Mobile number of the visitor |
| `booking_date` | `DATE` | NOT NULL | Scheduled tour date |
| `booking_time` | `NVARCHAR(50)` | NOT NULL | Chosen time slot (e.g. 10:00 AM) |
| `visitor_count` | `INT` | DEFAULT 1 | Total number of guests |
| `special_requests` | `NVARCHAR(500)` | NULL | Custom notes or special requests |
| `status` | `NVARCHAR(50)` | DEFAULT 'Confirmed' | Confirmed, Rescheduled, Cancelled |
| `created_at` | `DATETIME2` | DEFAULT GETDATE() | Record creation timestamp |
