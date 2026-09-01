# Delquro Connect (Web) — PRD

## Original problem statement
Build a web application that is a faithful clone of the existing Delquro Connect mobile app (Expo/React Native) for veterinary hospital team communication + coordination, consuming the exact same API contract (FastAPI + MongoDB). Brand: navy #0F3A5F + teal #00A5A8, serif headings, activity/pulse-wave logo. JWT auth in browser localStorage. Production-safe bootstrap (first admin via one-time code, invite-code joins, RBAC from user.permissions). 5 destinations: Huddle, Time Off, Schedule, Chat, More.

## User choices
- JWT stored in localStorage; Authorization: Bearer on every request.
- Build everything at once (full parity).
- Keep exact navy+teal serif brand identity; adapt slightly for desktop (left sidebar + mobile bottom nav).
- No deployed mobile backend URL yet → backend built in THIS project implementing the same contract; data (users, posts, chat, uploads via GridFS-style file collection) stored in this project's MongoDB. One env var swap can repoint later.

## Architecture
- Backend: FastAPI, all routes under /api, MongoDB via motor. auth.py (bcrypt + PyJWT). Files stored in db.files (binary) served at /api/files/{id} (Bearer or ?token=). RBAC via compute_permissions(role).
- Frontend: React 19 + react-router 7, axios client (src/lib/api.js) with Bearer interceptor + 401 handling, AuthContext, sonner toasts, Tailwind + CSS vars for brand. Fraunces serif for display.

## User personas
- Staff: reads huddle, requests time off, chats, gives kudos.
- Manager: + post huddle, approve time off, set day limits, upload schedules, invite, admin dashboard.
- Admin: + manage roles, manage locations.

## Core requirements (static)
Auth/bootstrap/setup, Huddle (posts/likes/comments/images), Time Off (calendar/approvals/day limits), Schedule library (upload/download), Chat (polling, images, read receipts), More (admin dashboard, directory, roles, invitations, locations, achievements/kudos, hospital rules), Profile settings. RBAC gating everywhere.

## Implemented (2026-06-08)
- Full backend API contract (auth, team/meta, huddle, timeoff, daylimit, schedules, upload/files, chat, knowledge, kudos/achievements, admin stats, invites, locations).
- Production-safe first-admin bootstrap via ADMIN_BOOTSTRAP_CODE; invite-code role assignment; brute-force lockout keyed on email (429 after 5 fails).
- All web screens + routing, brand design system, image viewer with zoom, relative timestamps, permission-gated UI, loading/empty/error states, toasts.
- Owner admin account: planexservices@gmail.com. Seeded demo team (Maria manager, Sam staff), posts, kudos, everyone chat, a location, a pending time-off.
- Tested: backend 34/35 (lockout fixed after), frontend flows 100% incl. staff-vs-admin RBAC.

## Backlog / next
- P1: enforce chat `access` tiers; per-file ACL on /files.
- P2: real-time via websockets (currently 3s polling); TTL index on login_attempts; split server.py into routers.
- P2: notification delivery for preference toggles.
