# Smart Waste Management System (AI & IoT Simulation)

This is a full-stack web application that simulates a smart waste management system. It uses an AI model to predict when waste bins will be full and an optimization algorithm to generate the most efficient collection routes for a fleet of trucks.

This project is configured to run with either a local MySQL database or a cloud-hosted AWS RDS database.

## 💻 Tech Stack

- **Backend:**
  - **Framework:** Flask
  - **Authentication:** JWT (JSON Web Tokens) with Flask-JWT-Extended
  - **Database:** MySQL with Flask-SQLAlchemy (compatible with local or AWS RDS)
  - **Background Jobs:** APScheduler
  - **AI/ML:** Scikit-learn, Pandas, NumPy
  - **Routing:** NetworkX

- **Frontend:**
  - **Framework:** React.js
  - **Mapping:** Leaflet & React-Leaflet
  - **API Client:** Axios

## ✨ Key Features

- **Secure Authentication:** Dual-role JWT-based login system restricting access based on user type (Administrator vs. Truck Driver).
- **Real-time IoT Simulation:** A backend job runs every 30 seconds to simulate waste generation with stable low, medium, and high traffic profiles for different bins.
- **AI-Powered Predictions:** A lightweight predictive analytics model runs every 5 minutes, using recent fill-rate trends from each bin's active cycle to estimate when it will become full.
- **Dynamic Route Optimization:** An algorithm runs every 15 minutes to generate the most efficient route for bins that are full, 70%+ filled, or predicted to become full within 1 hour.
- **Truck Assignment:** The optimizer automatically assigns an available truck (`TRUCK-001`, etc.) to the new route.
- **Interactive Dashboard:** A React frontend that displays:
  - All bins with color-coded status: Green for normal bins, Orange for bins at 70%+ fill or predicted to fill within 1 hour, and Red for full bins.
  - **Real-time statistics dashboard** with total bins, urgent collections, active routes, and distance metrics.
  - **Interactive urgent filtering** by clicking the urgent KPI card to show only bins that need attention.
  - **Urgent bin list** with bin ID, fill percentage, urgency reason, and predicted full time when the urgent filter is active.
  - **Interactive map legend** explaining normal, filling, full, route, and depot indicators.
  - **Right-side operations panel** with area summary, truck availability, and selected-bin controls.
  - **Bin fill history sparkline** inside each bin popup.
  - The active, optimized route with numbered stops.
  - The assigned truck and total route distance.
  - Historical waste and realistic sustainability trend charts.
- **Full Feedback Loop:** A "Mark as Collected" button on each bin's popup allows a user to simulate a collection.
- **Maintenance Controls:** A selected bin can be marked for maintenance or restored to service from the operations panel.
- **CSV Report Export:** A "Download CSV" button exports a bin state report with location, fill, status, and prediction data.
- **Database Reset Functionality:** A reset button in the dashboard (with confirmation dialog) that clears all simulation data while preserving admin credentials and bin infrastructure.
- **Dedicated Driver Panel:** A focused, streamlined interface for drivers showing their assigned route sequence, distance tracking, and one-click collection confirmation.
- **User Feedback System:** Toast notifications for important actions and events (successful operations, errors, etc.).

## 🧭 Dashboard Behavior

The dashboard is area-aware. Selecting a city changes the map center, depot, summary cards, active route, and visible bin set for that area.

### Bin Status Colors

- **Green:** Normal bin below 70% fill with no near-term full prediction.
- **Orange:** Filling bin at 70%+ fill or predicted to become full within 1 hour.
- **Red:** Full bin that needs urgent collection.
- **Yellow Triangle with Warning Symbol (⚠️):** A bin currently marked as in `MAINTENANCE` mode (operational simulator and routing algorithms will skip this bin).
- **Blue:** Depot marker.
- **Numbered marker:** A pending stop on the active optimized route.

### Urgent Filter

Click the **Urgent** metric card, or focus it and press **Enter**/**Space**, to toggle urgent-only mode. When active:

- The map shows only urgent bins for the selected area.
- The urgent card shows an active filtered state.
- A sidebar list appears with each urgent bin's ID, fill percentage, urgency reason, and predicted full text.

The urgent map filter currently shows bins that are `FULL` or at least 70% full, excluding bins marked `EMPTY`.

### Operations Panel

The right-side operations panel uses the open map space for operational controls and summaries without making the left dashboard longer. It includes:

- **Area Snapshot:** total bins, average fill, full bins, 70%+ bins, bins predicted within 1 hour, and maintenance bins for the selected city.
- **Truck Status:** each truck is shown as available or assigned, with its assigned area when it has a pending route.
- **Bin Control:** selecting a bin on the map shows maintenance actions for that bin.

### Bin History

Each bin popup includes a compact recent fill-history sparkline. The backend exposes this through:

```text
GET /api/bins/<bin_id>/history?limit=20
```

The chart uses recent `tbl_bin_history` readings and helps show how quickly the selected bin has been filling.

### Maintenance Mode

Bins can be marked as `MAINTENANCE` from the operations panel. Maintenance bins are skipped by both waste simulation and route generation. Restoring a bin returns it to service as `FILLING`, unless it is already at capacity.

### Route Generation

The route optimizer runs every 15 minutes and creates a pending collection route for bins that are operationally urgent:

- Bins with status `FULL`
- Bins at 70%+ fill
- Bins predicted to become full within 1 hour

Bins marked `EMPTY` or `MAINTENANCE` are excluded from route generation. The optimizer assigns an available truck and orders route stops using a nearest-neighbor route heuristic.

### Route Distance & Progress Tracking

The system features a dual-layer distance tracking system that combines backend database optimization with real-time frontend calculations:

- **Static Route Distance (Backend):** When a collection route is optimized, the backend calculates the complete, static round-trip distance (Depot → Ordered Bins → Depot) using the Haversine formula and commits it to the database (`total_distance_km` on the `Route` model).

- **Dynamic Remaining Distance (Frontend):** As the driver completes stops on an active route by marking bins as "Collected", the React client dynamically re-calculates the **Remaining Route Distance** in real-time. It computes the distance starting from the **last completed stop location** (or the Depot if no stops are completed yet) through the remaining `PENDING` stops, and finally back to the Depot. This keeps the mileage card perfectly in sync with the driver's actual remaining path.

- **Daily Cumulative Mileage (`distance_today_km`):** The right-side operations panel displays a live cumulative tracker for each truck representing its total completed route distance for the current calendar day (synchronized to Indian Standard Time/IST). This is calculated by querying and summing the `total_distance_km` of all `COMPLETED` routes for that specific truck within the active day.

### Simulation Model

The IoT simulation runs every 30 seconds. Each bin receives a stable traffic profile based on its ID, so bins do not all fill at the same speed:

- **Low traffic:** slower fill increments
- **Medium traffic:** moderate fill increments
- **High traffic:** faster fill increments

This keeps the dashboard active while producing more realistic variation between bin locations.

### Predictions

The backend `/api/bins` endpoint returns `predicted_full` as a UTC ISO-style string:

```text
YYYY-MM-DDTHH:MM:SS+00:00
```

The frontend formats this into a human-readable AM/PM date and relative time, such as "in ~30m", "very soon", "in ~5h", "in ~2d", or "due now". If no prediction is available, the dashboard shows that the bin is still being analyzed.

### Sustainability Metrics

Live and historical sustainability values are scaled for a small simulated fleet. The dashboard estimates fuel saved from avoided route stops and calculates CO2 reduction from fuel saved using a realistic emissions factor.

## 📚 Database Management

### 🔄 Reset Database

The dashboard includes a **Reset Database** button (🔄 Reset DB) that allows you to clear all simulation data and start fresh. This feature:

- **Empties all bins** - Resets all bin fill levels to 0.0
- **Clears routes** - Deletes all generated collection routes
- **Resets history** - Clears bin fill level history
- **Recreates trucks** - Ensures the truck fleet is ready for new route generation
- **Preserves admin credentials** - Your login information remains intact
- **Preserves bin infrastructure** - All bin locations and configurations are maintained

**How to use:**

1. Click the "🔄 Reset DB" button in the top-right corner of the dashboard
2. Confirm your action in the dialog that appears
3. Wait for the success toast notification
4. The simulation will automatically restart with fresh data

### 🚀 Getting Started

Follow these instructions to set up and run the project on your local machine.

### Prerequisites

- Python (3.9+)
- Node.js and npm
- A MySQL source. You can use a local MySQL server (Option 1) or an AWS account (Option 2).

### 1. Backend Setup

First, set up your Python environment:

1.  **Clone/Download:** Get the project code onto your machine.
2.  **Create Virtual Environment:**
    ```bash
    python -m venv venv
    ```
3.  **Activate Environment:**
    - **Linux/macOS (Zorin OS, etc.):**
      ```bash
      source venv/bin/activate
      ```
    - **Windows:**
      ```powershell
      .\venv\Scripts\activate
      ```
4.  **Install Python Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

Next, choose **one** of the following database options.

---

### Option 1: Local MySQL Setup (Easiest)

1.  **Install MySQL:** Ensure you have MySQL Server and MySQL Workbench installed on your PC.
2.  **Create Database:** Open MySQL Workbench and run the following command to create the database:
    ```sql
    CREATE DATABASE smart_waste_db;
    ```
3.  **Create `.env` File:** In the project's root folder, create a file named `.env`.
4.  **Generate a `SECRET_KEY`:** Run this in your terminal to get a secure key:
    ```bash
    # (Make sure your venv is active)
    python -c "import secrets; print(secrets.token_hex(32))"
    ```
5.  **Configure `.env`:** Copy the template below into your `.env` file. Replace the credentials with your **local** MySQL info and the key you just generated.

    ```dotenv
    # .env Template for Local Setup
    # Replace with your local MySQL username, password, and port (default is 3306)
    DATABASE_URL="mysql+pymysql://root:YourPassword@localhost:3306/smart_waste_db"
    SECRET_KEY="PASTE_YOUR_GENERATED_32-CHARACTER_KEY_HERE"
    JWT_SECRET_KEY="PASTE_ANOTHER_GENERATED_KEY_HERE"
    ```

---

### Option 2: AWS RDS Setup (Advanced)

1.  **Create AWS RDS Database:**
    - Log in to your AWS Console and go to **RDS**.
    - Click **"Create database"** -> "Standard Create" -> "MySQL".
    - Choose the **"Free tier"** template.
    - Set a **DB instance identifier** (e.g., `smart-waste-db-instance`).
    - Set your **Master username** (e.g., `admin`) and **Master password**. _Write these down!_
    - Under "Connectivity," set **"Public access"** to **"Yes"**.
    - Expand "Additional configuration" and set the **"Initial database name"** to `smart_waste_db`.
    - Click **"Create database"** and wait 5-10 minutes for it to become "Available".
2.  **Get Endpoint URL:** Once "Available," click the database name and copy its **Endpoint URL** from the "Connectivity & security" tab.
3.  **Generate Keys:** Run this in your terminal to get secure keys:
    ```bash
    # (Make sure your venv is active)
    python -c "import secrets; print(secrets.token_hex(32))"
    ```
4.  **Create `.env` File:** In the project's root folder, create a file named `.env`. Paste the template below, filling it with your **new AWS RDS credentials** and the keys you just generated.

    ```dotenv
    # .env Template for AWS RDS Setup
    # Remember to URL-encode special characters in your password! (e.g., @ becomes %40)
    DATABASE_URL="mysql+pymysql://YOUR_RDS_USERNAME:YOUR_RDS_PASSWORD@YOUR_RDS_ENDPOINT_URL:3306/smart_waste_db"
    SECRET_KEY="PASTE_YOUR_GENERATED_32-CHARACTER_KEY_HERE"
    JWT_SECRET_KEY="PASTE_ANOTHER_GENERATED_KEY_HERE"
    ```

---

### 2. Frontend Setup

This is the same for both options.

1.  **Navigate to Frontend Folder:**
    ```bash
    cd frontend
    ```
2.  **Install Node.js Dependencies:**
    ```bash
    npm install
    ```

### 3. Create Admin & Driver Users

Before running the application, you need to create the initial users to log in.

1.  **Ensure your virtual environment is active.**
2.  **Run the creation script:**
    ```bash
    python create_admin.py
    ```
    This will create two initial accounts:
    - **Admin:** Username: `admin` | Password: `password123` (Full dashboard access)
    - **Driver:** Username: `driver` | Password: `driver123` (Field collection interface)
    - You'll use these credentials to log in depending on which interface you want to use.

### 4. Running the Application

You must run both servers in two separate terminals.

1.  **Terminal 1 (Backend):**
    - In the root folder, activate your virtual environment (Linux: `source venv/bin/activate` or Windows: `.\venv\Scripts\activate`)
    - Run the Flask server. This will connect to your chosen database (local or AWS) and create the tables.
      ```bash
      python run.py
      ```

2.  **Terminal 2 (Frontend):**
    - Navigate to the frontend folder: `cd frontend`
    - Run the React server:
      ```bash
      npm start
      ```
    - Your dashboard will open at **`http://localhost:3000`**.
    - **Login** using the admin credentials (`admin` / `password123`) you created earlier.

### 🐛 Troubleshooting Development Server Errors

If you encounter an error when running `npm start` that looks like this:

`Invalid options object. Dev Server has been initialized... - options.allowedHosts[0] should be a non-empty string.`

This usually occurs due to strict host checking when using a VPN or certain network configurations.

**To resolve this:**

1.  Create a new file named **`.env`** in the root of the `frontend` directory.
2.  Add the following line to the `.env` file:

    ```
    DANGEROUSLY_DISABLE_HOST_CHECK=true
    ```

3.  Restart the development server.
