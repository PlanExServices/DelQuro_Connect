# Deploying DelQuro Connect (Coolify, Docker, any host)

Two supported topologies — pick one:

| | **A. Single application** (recommended) | **B. Split frontend + backend** |
| :--- | :--- | :--- |
| Resources in Coolify | 1 application + 1 MongoDB | 2 applications + 1 MongoDB |
| Dockerfile | `/Dockerfile` (repo root) | `/Dockerfile.backend` + `/frontend/Dockerfile` |
| Domains | one (`https://app.example.com`) | two (`app…`, `api…`) or nginx proxy |
| CORS / build-time API URL | not needed (same origin) | needed (`CORS_ORIGINS`, `REACT_APP_BACKEND_URL`) |
| Best for | going live quickly, fewest moving parts | splitting services, CDN-cached frontend |

Both are stateless: all data (accounts, posts, schedules **and uploaded files**)
lives in MongoDB, so containers can be recreated or scaled freely. Back up the
MongoDB resource and you have backed up everything.

---

## 0. Before you start

- Push this repo to GitHub (already done for the `arena/…` branch; merge the PR
  into the branch Coolify watches — normally `main`).
- Have your Coolify server connected to GitHub.
- Generate a JWT secret once: `openssl rand -base64 48`.

---

## A. Single application (recommended)

### A1. Create the database
1. Coolify → your **Project** → **+ New Resource** → **Databases** → **MongoDB** (7.x).
2. Deploy it, then open the resource and copy the **internal connection string**
   (looks like `mongodb://root:<password>@mongodb-<uuid>:27017`).
3. Append `?authSource=admin` if it is not already there — that is what the
   generated `root` user authenticates against:
   `mongodb://root:<password>@mongodb-<uuid>:27017/?authSource=admin`
4. Give it a name (`DELQURO_DB`). No public port is needed.

### A2. Create the application
**+ New Resource** → **Applications** → your Git source → this repository, then:

| Setting | Value |
| :--- | :--- |
| Build Pack | **Dockerfile** |
| Base Directory | `/` *(default)* |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `8000` |

> The image builds the React app (Node stage) and the FastAPI backend, then
> serves both from port 8000 — the SPA at `/`, the API at `/api`.

### A3. Environment variables
Add on the application's **Environment Variables** page (see `.env.example`):

| Key | Value |
| :--- | :--- |
| `MONGO_URL` | the internal connection string from A1 (possibly `$DELQURO_DB` variable references) |
| `DB_NAME` | `delquro_connect` |
| `JWT_SECRET` | your `openssl rand -base64 48` value |
| `ADMIN_BOOTSTRAP_CODE` | e.g. `DELQURO-SETUP-2026` — needed to create the first admin |
| `CORS_ORIGINS` | leave unset (same origin) |
| `PORT` | `8000` |

### A4. Domain + health check
1. **Configuration → Domains**: set `https://app.example.com` (point the DNS A
   record at the server first). Coolify issues the TLS certificate via Let's Encrypt.
2. **Configuration → Healthcheck**: **Enable**, type **HTTP**, port `8000`,
   path `/health`, return code 200. (The image also has a Dockerfile
   `HEALTHCHECK`; Coolify shows a caution banner when it detects one — enabling
   the health check as above is the supported path.)
3. **Deploy**. Watch the build log; the container should end up **running/healthy**.

### A5. First run in the app
1. Open `https://app.example.com` → you are redirected to `/setup`.
2. Create the first account with the `ADMIN_BOOTSTRAP_CODE` you set — that user
   becomes the **admin** (Medical Director role).
3. Invite everyone else from **Hospital Tools → Invitations** (each invite code
   carries a role and campus); self-registration without an invite is closed
   once an admin exists.
4. Afterwards, rotate or delete `ADMIN_BOOTSTRAP_CODE` and redeploy (it is
   ignored once an admin exists, but there is no reason to keep it).

### A6. Verify
- `https://app.example.com/health` → `{"status":"ok","service":"delquro-connect"}`
  (liveness — what the Coolify health check should point at)
- `https://app.example.com/health/ready` → `{"status":"ok","database":"ok",…}`.
  If MongoDB is unreachable this returns **503** within ~5s — the fastest way to
  catch a wrong `MONGO_URL`.
- A deep link such as `https://app.example.com/timeoff` loads the app (SPA
  fallback), and hard-refreshing it still works.
- Sign in, post a Huddle update, upload a schedule, send a chat message.

---

## B. Split frontend + backend

### B1. Database — same as A1.

### B2. Backend application
| Setting | Value |
| :--- | :--- |
| Build Pack | Dockerfile |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile.backend` |
| Ports Exposes | `8000` |
| Domain | `https://api.example.com` |

Environment variables: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`,
`ADMIN_BOOTSTRAP_CODE`, and — importantly —
`CORS_ORIGINS=https://app.example.com` (comma-separate several origins; it must
match the browser origin exactly, including scheme, no trailing slash).

### B3. Frontend application
| Setting | Value |
| :--- | :--- |
| Build Pack | Dockerfile |
| Base Directory | `/frontend` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `80` |
| Domain | `https://app.example.com` |

Environment variables / build variables:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `BACKEND_URL` | `http://<backend-container>:8000` (internal) or `https://api.example.com` | nginx proxies `/api/*` here, so the browser still talks to one origin — CORS stays simple |
| `REACT_APP_BACKEND_URL` | *(leave empty)* | Build-time var; only set it if you want the browser to call the API **directly** on another origin (then CORS must allow it) |

> `REACT_APP_BACKEND_URL` is baked in at build time — changing it requires a
> rebuild, not just a restart. Leaving it empty (the default) is recommended:
> nginx then proxies the API on the same origin. In Coolify, build-time values
> are only passed to the Dockerfile when **Configuration → Advanced → Inject
> Build Args to Dockerfile** is enabled.

### B4. Health check
Backend: HTTP `8000` `/health`. Frontend: HTTP `80` `/`.

---

## Environment variable reference

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `MONGO_URL` | ✅ | — | MongoDB connection string |
| `DB_NAME` | ✅ | — | Database name (e.g. `delquro_connect`) |
| `JWT_SECRET` | ✅ | — | Signs session tokens; 32+ random chars; rotating it logs everyone out |
| `ADMIN_BOOTSTRAP_CODE` | first run | — | Enables creating the first admin at `/setup` |
| `CORS_ORIGINS` | split topology | `*` | Comma-separated allowed browser origins |
| `PORT` | no | `8000` | Port uvicorn binds (keep in sync with Ports Exposes) |
| `FRONTEND_BUILD_DIR` | no | `/app/frontend_build` in the all-in-one image | Where the SPA build lives; if missing, the API runs alone |

---

## Everyday operations

- **Deploy an update** — push to the watched branch (or press **Redeploy**).
  Coolify rebuilds; the app is stateless so a restart is safe mid-shift.
- **Roll back** — Coolify keeps previous deployments; redeploy the last good one.
  Database migrations are additive (indexes are created automatically on boot).
- **Backups** — Coolify can schedule MongoDB backups (S3/local). Test a restore
  once: schedules, huddle attachments and avatars are stored in the database.
- **Scaling** — multiple replicas are safe (no local disk state, no in-process
  cache). Chat uses WebSockets, so enable sticky sessions if you run more than
  one replica behind a load balancer.

---

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `No available server` on the domain | Container not healthy or wrong port. Check logs; confirm **Ports Exposes = 8000** and the app logged `Uvicorn running on http://0.0.0.0:8000`. |
| App loads, every request fails / `index setup:` warning about `Connection refused` | MongoDB is unreachable from the container. Check `GET /health/ready` (503), re-copy the **internal** connection string, and keep `?authSource=admin` in the `MONGO_URL`. The app deliberately stays up so you can see this state instead of crash-looping. |
| Live chat isn't instant | The WebSocket library is missing (`pip install websockets`, already in `requirements.txt`) or a proxy is stripping the `Upgrade` header — see the nginx template. |
| Build fails at `pip install` | `backend/requirements.txt` needs network access from the build; re-run the build (transient PyPI/DNS issues). |
| Build fails at `npm ci` | `frontend/package.json` and `frontend/package-lock.json` are out of sync — run `npm install` locally and commit the lockfile. |
| App loads but every API call is 401/404 | You deployed the split topology without `CORS_ORIGINS`, or `REACT_APP_BACKEND_URL` points at the wrong host. Simplest fix: use the single-application topology (A). |
| `RuntimeError: Missing required environment variable 'MONGO_URL'` | Environment variables were not saved/applied — add them and redeploy. |
| Login returns 429 | Brute-force lockout (5 failed attempts / 15 min) keyed on the email. Wait, or clear the `login_attempts` collection in MongoDB. |
| Chat messages don't appear live | WebSocket blocked by a proxy. The nginx template already forwards `Upgrade`/`Connection`; if you front it with another proxy, forward those headers too. |
| Uploads over 15 MB rejected (413) | Intentional — MongoDB documents cap at 16 MB. Raise `MAX_UPLOAD_BYTES` in `backend/server.py` and move files to S3/GridFS if you need more. |
| `JWT_SECRET is shorter than 32 characters` warning | Use a longer secret (`openssl rand -base64 48`). |
| `BCRYPT`/`cryptography` build errors | The images install `gcc`/`libffi-dev` already; if you use your own base image, add those packages. |

---

## Local production replay

```bash
cp .env.example .env      # set JWT_SECRET
docker compose up --build # MongoDB + all-in-one app on http://localhost:8000
```

Split topology locally:

```bash
docker build -f Dockerfile.backend -t delquro-api .
docker build -t delquro-web ./frontend
docker network create delquro
docker run -d --network delquro --name api -p 8000:8000 --env-file .env delquro-api
docker run -d --network delquro -e BACKEND_URL=http://api:8000 -p 8080:80 delquro-web
# → http://localhost:8080
```
