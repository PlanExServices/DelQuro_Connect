# DelQuro Connect — Veterinary Hospital Coordination

> **PlanExServices / DelQuro Connect & CAH Connect**
> A mobile-first veterinary coordination platform with four mobile tabs, a team Huddle, daily time-off capacity, retained schedules, and team chat.

---

## 📱 Mobile-First Navigation Structure (4 Condensed Tabs)

| Tab | Position | Scope & Key Capabilities |
| :--- | :---: | :--- |
| **1. 📢 Huddle** | **Far Left & Default** | Team announcements, the latest versioned protocol with individual acknowledgment, photo attachments, and team celebrations. |
| **2. 📅 Time Off** | **Center-Left** | Monthly approved/limit counts, Full and Closed days, pending indicators, daily coverage detail, requests, and manager approvals. |
| **3. 📋 Schedule** | **Center-Right** | Retained schedules with effective dates, campus and department filters, plus image and in-app PDF previews. |
| **4. 💬 Chat** | **Far Right** | Team conversations with unread counts directly in the mobile navigation. |

---

## 🏥 Key Module Breakdown (Unified)

### 1. 📢 Huddle (Hospital Feed & Clinical Protocols)
- **Default View:** Greets staff immediately upon launch with the active hospital feed.
- **Current Protocol:** Managers can pin a versioned post. The newest protocol appears at the top with its date and an individual acknowledgment action.
- **Attachment Viewer:** Tap an image attachment to zoom and pan.
- **Team Celebrations:** Birthdays, anniversaries, and the kudos spotlight follow the main feed.

### 2. 📅 Time Off & Capacity Management (Primary Lane)
- **Interactive Calendar Grid:** Month navigation, Today, approved/limit counts, Full and Closed labels, and pending-request dots.
- **Day Limits & Overrides:** Managers can set a daily maximum (0–8); the default is 2.
- **Request Flow:** Full-day requests include a reason and a capacity warning. Managers can approve or decline pending requests and add an already-approved entry.

### 3. 📋 Master Schedule (Retained Records)
- **Retained Uploads:** Uploads are listed separately until a manager deletes them.
- **Effective Dates:** New uploads include a title, start and end date, and optional campus and department. Current and Upcoming tabs follow those dates; All posted includes earlier uploads.
- **File Preview:** Images open in the zoom viewer, and PDFs render in-app with page controls. Other file types remain downloadable.

### 4. 💬 Chat and Tools
- **Shift Chat:** User-created group conversations are accessible from the mobile Chat tab and desktop sidebar. Unread counts appear in navigation.
- **Tools & Settings:** One gear destination for account preferences, team tools, campus branding and administration; open it from the mobile header or desktop sidebar.
- **Team Directory & Locations:** Staff directory and role-based campus management.
- **Administration:** Manage roles, invitations, and locations according to permissions.

### Implementation status (read me first)

Time off is currently requested per full day. There is no in-app practice
seeder/reset, persona switcher, or separate archived-schedule view. Chat groups
are user-created; optional development seeding is available from the server.

The requested native iPhone/Android companion and workstation phone approval
flow are specified in [the mobile authentication and Chat design](docs/WORKSTATION_MOBILE_AUTH_DESIGN.md).
The `mobile/` Expo project is a starter only; web phone approval, one-hour
workstation sessions, a single canonical Chat group, and on-site alerts are
not implemented yet.

The [veterinary team and naming brief](docs/VETERINARY_TEAM_NAMING_BRIEF.md)
records public industry research and criteria for choosing a product name with
the hospital team. DelQuro Connect remains the working preview name.
The [project context and decisions](docs/PROJECT_CONTEXT.md) records confirmed
requirements and naming constraints for future work.

The local web preview now has [configurable campus branding](docs/CAMPUS_BRANDING.md):
COMMON uses Commonwealth Animal Hospital's public logo and website colors,
and administrators can edit each campus's ID tag, website, logo and palette
under the unified **Tools & Settings** gear. This is visual customization and
campus assignment, not hospital-by-hospital data isolation.

---

## 🏗 Architecture

- **Frontend:** React 19 + React Router 7 + Tailwind CSS. Mobile-first responsive layout with desktop sidebar and condensed mobile bottom nav. Brand palette: navy `#1B2A4A`, teal `#00A5A8`, burgundy `#6B1D2F`, gold `#C89228`, ice `#E8F1F5`, sage `#2E7D32`. Fonts: Inter (sans) + Merriweather / Fraunces (serif display).
- **Backend:** FastAPI + MongoDB (motor) with JWT auth (`localStorage`), RBAC (`compute_permissions`), file uploads (`GridFS`-style binary storage), real-time chat (polling + WebSocket), and brute-force lockout protection.
- **Design System:** CSS variables for consistent theming, `sonner` toasts, `lucide-react` icons, `card-shadow` and `soft` shadows, and `animate-fade-up` micro-animations.

---

## 🔐 Auth & RBAC

- **Bootstrap:** First admin via one-time `ADMIN_BOOTSTRAP_CODE`.
- **Invite Flow:** Invite codes assign role (`staff` / `manager` / `admin`) and campus.
- **Roles:**
  - **Staff:** Huddle, Time Off, Schedule, Chat, Profile.
  - **Manager:** + Post Huddle, Approve Time Off, Set Day Limits, Upload Schedules, Invite, Admin Dashboard.
  - **Admin:** + Manage Roles, Manage Locations.
- **Brute-Force Lockout:** 5 failed attempts = 15-minute lockout (`login_attempts` collection).

---

## 📦 Tech Stack

### Frontend
- React 19, React Router 7, Tailwind CSS 3.4
- `lucide-react`, `sonner`, `clsx`, `tailwind-merge`, `pdfjs-dist`
- `react-day-picker` (calendar), `date-fns`

### Backend
- FastAPI 0.110.1, Uvicorn 0.25.0 (+ `websockets` for the chat WebSocket)
- MongoDB (motor 3.3.1) + `pymongo`
- JWT (`pyjwt`), bcrypt (`bcrypt`), `python-dotenv`
- CORS middleware, file upload via FormData, optional static hosting of the
  built frontend (single-container deployment)

---

## 🚀 Running the App

### 1. Backend (FastAPI + MongoDB)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

cp backend/.env.example backend/.env     # then edit MONGO_URL / DB_NAME / JWT_SECRET
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Required variables (see `backend/.env.example`): `MONGO_URL`, `DB_NAME`, `JWT_SECRET`.
Optional: `CORS_ORIGINS`, `ADMIN_BOOTSTRAP_CODE`, `PORT`.

**No MongoDB handy?** Run the same app on an in-memory MongoDB stand-in with
demo data (development only):

```bash
pip install -r backend/requirements-dev.txt
IN_MEMORY_DB=1 SEED_DEMO=1 python backend/dev_server.py
# demo sign-in: eleanor@delquroconnect.com / Delquro2026 (all demo users share that password)
```

Health checks: `GET /health` (liveness, also `/api/health`) and
`GET /health/ready` (also pings MongoDB, returns 503 when it is unreachable).

### 2. Frontend (React + CRACO)

```bash
cd frontend
npm install
cp .env.example .env        # optional — see below
npm start                   # http://localhost:3000
```

- With `REACT_APP_BACKEND_URL` empty, the app calls the relative `/api` path and
  the dev server proxies it to `http://127.0.0.1:8000` (override with
  `BACKEND_PROXY_TARGET`). Production builds can also be served same-origin
  behind a reverse proxy that forwards `/api` to the backend.
- Set `REACT_APP_BACKEND_URL=https://api.example.com` to talk to a backend on a
  different host. `npm run build` emits a static bundle in `frontend/build`.

### 3. Docker

```bash
# All-in-one image: builds the React app and serves it + the API from one port
docker build -t delquro-connect .
docker run -p 8000:8000 --env-file .env delquro-connect      # http://localhost:8000

# ...or the pieces separately
docker build -f Dockerfile.backend -t delquro-connect-api .   # API only (:8000)
docker build -t delquro-connect-web ./frontend                # SPA + /api proxy (:80)

# ...or the whole stack (MongoDB included)
cp .env.example .env && docker compose up --build
```

Both images honour `$PORT` (default 8000) and ship a `/health` HEALTHCHECK.

### 4. Deploy to Coolify

Production deployment is documented step by step in
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Short version — one Coolify
application plus a MongoDB resource:

| Setting | Value |
| :--- | :--- |
| Build Pack | Dockerfile |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `8000` |
| Health check | HTTP, port `8000`, path `/health` |
| Env vars | `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_CODE` |

The container serves the SPA at `/` and the API at `/api` on the same origin, so
no CORS setup or build-time backend URL is required. Create the first admin at
`/setup` with `ADMIN_BOOTSTRAP_CODE`, then invite the team from Tools & Settings →
Invitations. Prefer separate frontend/backend applications? Use
`Dockerfile.backend` + `frontend/Dockerfile` — settings are in the deployment guide.

### 5. Tests

```bash
# start a backend first (see above), then:
cd backend && pytest tests/ -q                     # uses $BACKEND_URL or http://localhost:8000
```

The suites assume the seeded workspace described in `test_result.md`
(`#general` chat, admin/manager/staff accounts) — `SEED_DEMO=1` creates a
comparable set of data.

---

## ✅ Merged From

- [PlanExServices/DelQuro_Connect](https://github.com/PlanExServices/DelQuro_Connect) — Full working React + FastAPI + MongoDB implementation.
- [PlanExServices/CAH_Connect](https://github.com/PlanExServices/CAH_Connect) — Design spec, branding (burgundy/gold/navy/ice), mobile-first 4-tab navigation, capacity engine descriptions, and feature breakdown.

Both repositories describe the same core veterinary coordination product. This unified repo keeps all working code from DelQuro Connect and merges the design identity, navigation structure, feature descriptions, and brand language from CAH Connect.
