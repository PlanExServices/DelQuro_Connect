# DelQuro Connect — Unified Veterinary Hospital Coordination

> **PlanExServices / DelQuro Connect & CAH Connect**  
> A mobile-first, unified veterinary coordination platform combining the full feature sets of both repositories. Engineered with a **4-tab condensed mobile navigation** (Huddle as default), **Time Off capacity engine**, **multi-document master schedule retention**, and **frictionless persona switching**.

---

## 📱 Mobile-First Navigation Structure (4 Condensed Tabs)

| Tab | Position | Scope & Key Capabilities |
| :--- | :---: | :--- |
| **1. 📢 Huddle** | **Far Left & Default** | Hospital announcements, pinned surgical/antibiotic safety protocols (fixed top banner with gold/burgundy), document & clinical photo attachments with zoom/pinch viewer, one-tap *"Read & Understood"* compliance tracking, emoji reactions, kudos spotlight. |
| **2. 📅 Time Off** | **Center-Left (Primary Lane)** | Full interactive monthly calendar, capacity rules (*System Default 2/day vs Custom Overrides 0–8*), inline unavailable reasons, staff request workflow (Full Day, AM Shift, PM Shift, Night Shift, Custom Hours), manager approvals/denials with response notes, and **Direct Manager Scheduling**. |
| **3. 📋 Schedule** | **Center-Right** | Multi-document retained posted schedules (no file overwriting), required custom naming, effective timeframe classification (*Current Active, Upcoming, All Posted, Archived*), department filtering, and high-resolution zoom viewer. |
| **4. ⚡ Hospital Tools** | **Far Right** | Unified mobile center with segmented controls for **Shift Chat** (`#general`, `#vet-techs`, `#doctors-dvm`, `#front-desk`), **Staff Roster & Campus Management**, **Hospital Settings & Capacity Rules**, and **Alpha Persona Switcher**. |

---

## 🏥 Key Module Breakdown (Unified)

### 1. 📢 Huddle (Hospital Feed & Clinical Protocols)
- **Default View:** Greets staff immediately upon launch with the active hospital feed.
- **Pinned Protocol Banner:** Critical clinical alerts stay pinned to the top in a gold/burgundy banner.
- **Attachment Viewer:** Tap any attachment to zoom (`+` / `-`), pan/drag, simulate mobile pinch-to-zoom, and download.
- **Compliance Tracking:** *"Mark as Read"* and *"Read & Understood"* protocol verification.
- **Kudos Spotlight:** Weekly team recognition displayed prominently.

### 2. 📅 Time Off & Capacity Management (Primary Lane)
- **Interactive Calendar Grid:** Month navigation, quick jump to today, and day status indicators (*`0/2 off`, `2/2 FULL`, `CLOSED`*).
- **Day Limits & Overrides:** Set custom max staff (0–8) or close dates with management notes (e.g., *"All-Hands Hospital Inspection"*).
- **Staff Request Flow:** Full Day, AM Shift, PM Shift, Night Shift, Custom Hours, reason, and live capacity warning.
- **Direct Manager Scheduling:** Managers can directly schedule approved time off for any staff member without waiting for pending requests.

### 3. 📋 Master Schedule (Retained Records)
- **Permanent Retention:** Every upload is preserved rather than replacing previous records.
- **Custom Title Required:** Explicit schedule names (e.g., *"Master Floor & Surgery — Week of Aug 10-16"*).
- **Timeframe Classification:** Grouped into Current Active, Upcoming, All Posted, and Archived.

### 4. ⚡ Hospital Tools (Chat, Directory, Settings, Persona Switcher)
- **Shift Chat:** Multi-channel team messaging (`#general`, `#vet-techs`, `#doctors-dvm`, `#front-desk`).
- **Staff Roster & Campus Management:** Directory and multi-campus support (CAH Main Campus + North Urgent Care branch).
- **Hospital Settings & Capacity Rules:** Manage capacity defaults, roles, invitations, and location settings.
- **Alpha Persona Switcher:** Zero-credential switching between **Alice Chen** (*Lead LVT*), **Marcus Green** (*Vet Tech*), **Sophia Taylor** (*Reception*), **Jordan Miller** (*Assistant*), **Cody Martinez** (*Practice Manager*), and **Dr. Eleanor Vance** (*Medical Director/Admin*).
- **Practice Seeder & Reset:** Optional button to load realistic August 2026 practice data or reset to factory clean state.

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
- `lucide-react`, `sonner`, `clsx`, `tailwind-merge`
- `react-day-picker` (calendar), `date-fns`

### Backend
- FastAPI 0.110.1, Uvicorn 0.25.0
- MongoDB (motor 3.3.1) + `pymongo`
- JWT (`pyjwt` + `python-jose`), bcrypt (`bcrypt`), `python-dotenv`
- CORS middleware, file upload via FormData

---

## 🚀 Running the App

```bash
# Backend
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm start
```

Set `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, and `CORS_ORIGINS` in `backend/.env`.

---

## ✅ Merged From

- [PlanExServices/DelQuro_Connect](https://github.com/PlanExServices/DelQuro_Connect) — Full working React + FastAPI + MongoDB implementation.
- [PlanExServices/CAH_Connect](https://github.com/PlanExServices/CAH_Connect) — Design spec, branding (burgundy/gold/navy/ice), mobile-first 4-tab navigation, capacity engine descriptions, and feature breakdown.

Both repositories describe the same core veterinary coordination product. This unified repo keeps all working code from DelQuro Connect and merges the design identity, navigation structure, feature descriptions, and brand language from CAH Connect.
