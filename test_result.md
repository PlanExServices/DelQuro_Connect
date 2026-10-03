#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Please fix this repo (install/build/deploy breakage plus the defects left open by earlier test iterations)"

backend:
  - task: "Dependencies installable from public PyPI"
    implemented: true
    working: true
    file: "backend/requirements.txt"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "emergentintegrations==0.2.0 is not published on PyPI and is imported nowhere, so `pip install -r backend/requirements.txt` (and the Docker build) failed with 'No matching distribution found'. Removed it plus other unused scaffold packages (passlib, python-jose, boto3, pandas, numpy, requests-oauthlib, jq, typer, black, isort, flake8, mypy)."
      - working: true
        agent: "main"
        comment: "Verified in a clean python3.11 venv: pip install -r backend/requirements.txt + requirements-dev.txt succeed."

  - task: "Upload size guard (MongoDB 16 MB document limit)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/upload and POST /api/schedules/upload now reject files > 15 MB with 413 instead of failing the insert with a 500. Verified: 15 MB + 1 byte -> 413."

  - task: "PATCH /api/me can clear birthday/start_date"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 1
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "iteration_2/iteration_3: explicit JSON null could not clear birthday/start_date; empty string was stored instead of null."
      - working: true
        agent: "main"
        comment: "Now uses model_dump(exclude_unset=True); null/empty strings $unset the field, MM-DD / YYYY-MM-DD are validated (02-30 rejected, 02-29 accepted), empty name -> 400. Verified 5/5 checks."

  - task: "Account deletion cascade + kudos spotlight"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 1
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "iteration_3: kudos are not cascaded on user delete, so /api/kudos/spotlight kept advertising deleted users for 7 days."
      - working: true
        agent: "main"
        comment: "DELETE /api/me now cascades posts/comments/kudos/time-off and removes the user from chat memberships; spotlight walks the leaderboard and only features users that still exist (live name/job_title, deterministic tie-break on most recent kudos). Verified with a temp user + 3 kudos: featured before delete, gone after."

  - task: "Login lockout hygiene"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Counter is keyed on the normalised email (previous fix, confirmed by 5x401 -> 429 in backend_test.py); added window reset after expiry, updated_at bookkeeping and a 1-day TTL index on login_attempts."

  - task: "Time-off capacity rules"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "System default is now 2/day (was 3, contradicting the UI copy 'system default 2/day' and the README), overrides are validated 0-8, dates must be YYYY-MM-DD, and duplicate requests for the same date return 409."

  - task: "Health endpoints / env validation / CORS ordering"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added GET /health and GET /api/health, fail-fast readable errors for missing MONGO_URL/DB_NAME/JWT_SECRET, and registered CORSMiddleware before include_router."

frontend:
  - task: "npm install works from a clean checkout"
    implemented: true
    working: true
    file: "frontend/package.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "npm install failed twice: ERESOLVE date-fns@4.1.0 vs react-day-picker@8.10.1 (peer ^2.28||^3) and react@19 vs react-day-picker@8.10.1 (peer ^16.8||^17||^18); --legacy-peer-deps then died fetching @emergentbase/visual-edits from assets.emergent.sh, which is unreachable (curl exit 35)."
      - working: true
        agent: "main"
        comment: "react-day-picker bumped to 9.14.0 (peer react >=16.8), the unreachable tarball dependency removed (craco.config.js already degrades gracefully without it), package-lock.json committed. `npm install` now adds 1489 packages with no errors; `npm run build` compiles successfully."

  - task: "Backend URL fallback + dev proxy + preview host"
    implemented: true
    working: true
    file: "frontend/src/lib/api.js, frontend/craco.config.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "A missing REACT_APP_BACKEND_URL produced requests to 'undefined/api'; the dev server rejected non-localhost hosts."
      - working: true
        agent: "main"
        comment: "API falls back to the relative /api path; craco dev server binds 0.0.0.0, allows all hosts and proxies /api (incl. websockets) to BACKEND_PROXY_TARGET (default http://127.0.0.1:8000) when no backend URL is configured. Verified end-to-end through the dev server: login 200 and posts/chats/schedules/members/achievements/spotlight all 200."

  - task: "Third-party blocking script in index.html"
    implemented: true
    working: true
    file: "frontend/public/index.html"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Removed the blocking <script src='https://assets.emergent.sh/scripts/emergent-main.js'> — an unreachable third-party host that delayed/blanked the app. The PostHog snippet was left untouched."

  - task: "Calendar component on react-day-picker v9 API"
    implemented: true
    working: true
    file: "frontend/src/components/ui/calendar.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Rewritten for v9 (month_caption/button_previous/button_next/month_grid/day_button classNames, Chevron component, style.css import). The component is not imported by any page, but it compiles in the production build."

  - task: "Time off day-limit input bounds"
    implemented: true
    working: true
    file: "frontend/src/pages/TimeOff.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Number input now has max=8, matching the backend's 0-8 validation."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 4
  run_ui: true

test_plan:
  current_focus:
    - "Backend regression: backend_test.py 35/35, test_changes.py 11/11, test_projections.py 6/6 (pytest, seeded workspace)"
    - "New guards: uploads, day limits, duplicate time off, delete-me cascade, PATCH /me clearing (18/18 ad-hoc checks)"
    - "Frontend: npm install + npm run build + dev-server proxy against the FastAPI backend"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Fixed the install/build blockers (npm peer conflict + unreachable @emergentbase/visual-edits tarball, emergentintegrations PyPI pin, lowercase dockerfile) and the open defects from iterations 1-3. Verified locally: pip install clean, npm install + npm run build clean, 52/52 backend pytest cases pass in our seeded test workspace, and the full stack (CRA dev server -> /api proxy -> FastAPI) serves the app. Remaining known gaps are documented in the README: no seeder/persona switcher, no shift-based time off, /api/files/{fid} has no per-file ACL, chat access tiers are stored but not enforced."


# ---------------------------------------------------------------------------
# Iteration 5 (main agent) — Coolify / production deployment readiness
# ---------------------------------------------------------------------------

user_problem_statement: "ok we need to push live to coolify"

backend:
  - task: "WebSocket chat works in production images"
    implemented: true
    working: true
    file: "backend/requirements.txt"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "uvicorn was installed WITHOUT a WebSocket implementation, so uvicorn logged 'No supported WebSocket library detected' and answered every upgrade request with 404: realtime chat could never work in the container (the client silently fell back after the socket failed). Reproduced with a raw WS client, then fixed by adding websockets>=12.0 to requirements.txt."
      - working: true
        agent: "main"
        comment: "Verified end-to-end: WS handshake to /api/ws/chat/{cid} succeeds, typing events broadcast to other members, and a bogus token is rejected (1008)."

  - task: "Single-container deployment (API + built SPA on one origin)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "FastAPI now serves the production frontend build when FRONTEND_BUILD_DIR exists (default <repo>/frontend/build; set to /app/frontend_build in the image) with SPA deep-link fallback, immutable caching for hashed /static assets and no-cache for index.html. Unknown /api/* paths stay JSON 404s instead of returning the SPA shell. Path traversal is blocked via Path.is_relative_to(). 27/27 production-layout checks pass (deep links /huddle /timeoff /schedule /chat/:id /more/admin /celebrations/:type, asset caching, JSON 404s, traversal attempts)."

  - task: "Fail fast when MongoDB is unreachable"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "With a wrong MONGO_URL the container started, /health returned 200, and requests hung for motor's 30s default before failing — the worst possible deployment failure mode (Looks healthy, silently broken)."
      - working: true
        agent: "main"
        comment: "AsyncIOMotorClient(serverSelectionTimeoutMS=5000), a logged warning at startup, and a new GET /health/ready that pings MongoDB (503 with diagnostics in ~5s when it is down). /health stays a fast liveness probe for the Coolify health check; the SPA shell still loads when the DB is down so users get an error instead of a blank page."

  - task: "Duplicate-slash tolerance (reverse-proxy safety)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "New NormalizePathMiddleware collapses '//api/x' -> '/api/x'. Needed because nginx proxy_pass with a trailing-slash upstream URL produces exactly that; verified //api/health -> 200, //api/posts -> 401/200 as expected."

  - task: "CORS credentials vs wildcard origin"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "allow_credentials is now only enabled for explicit origin lists (browsers reject '*'+credentials anyway). Auth uses Bearer tokens, so nothing changes for clients; split deployments get working preflights."

frontend:
  - task: "WebSocket URL for relative (same-origin) API base"
    implemented: true
    working: true
    file: "frontend/src/lib/api.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "wsUrl() did API.replace(/^http/,'ws'); with the relative '/api' base used by the all-in-one/nginx deployments that produced the invalid URL '/api/ws/chat/..' and new WebSocket() threw, so chat had no realtime updates."
      - working: true
        agent: "main"
        comment: "Relative bases are expanded with window.location (wss:// on https, ws:// otherwise). Verified by executing the real function from source in Node for 4 base/host/protocol combinations, and by confirming the pattern in the built bundle."

  - task: "Static nginx image for the split topology"
    implemented: true
    working: true
    file: "frontend/Dockerfile, frontend/nginx.conf.template"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "nginx serves the CRA build with SPA fallback and proxies /api (incl. WebSocket upgrade headers) to $BACKEND_URL, appending $request_uri so the path survives a trailing slash in BACKEND_URL. Template rendering verified (only ${...} placeholders substituted; nginx $variables preserved). Not executed here — no docker daemon in this environment."

deployment:
  - task: "All-in-one production image"
    implemented: true
    working: true
    file: "Dockerfile"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Root Dockerfile: node:20 stage builds the SPA (npm ci from the committed lockfile), python:3.11-slim stage installs requirements and copies the build to /app/frontend_build. Static checks pass (COPY sources exist, stage references resolve). Dockerfile.backend is the API-only variant; frontend/Dockerfile the static-host variant. No BuildKit-only features, so the syntax directive was removed to avoid requiring a docker/dockerfile:1 pull."

  - task: "docker-compose stack + env templates + deployment guide"
    implemented: true
    working: true
    file: "docker-compose.yml, .env.example, docs/DEPLOYMENT.md"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "compose (MongoDB 7 + app, health-checked, volume-backed) validates as YAML. Coolify instructions cover the recommended single-app topology (Build Pack Dockerfile, Base Directory /, Dockerfile Location /Dockerfile, Ports Exposes 8000, health check /health) and the split topology, plus the first-admin bootstrap, env reference, rollback/backup/scale notes and a troubleshooting table."

  - task: "Runtime dependencies verified as installed by the image build"
    implemented: true
    working: true
    file: "backend/requirements.txt"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Fresh venv + pip install -r backend/requirements.txt (4s, 'No broken requirements found') then `python -m uvicorn server:app` imported and served the app with only runtime deps — this is the exact command the Docker CMD runs."

regression:
  - task: "Existing pytest suites still pass"
    implemented: true
    working: true
    file: "backend/tests/*.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "backend_test.py 35/35 (three consecutive parallel runs + serial), test_changes.py 11/11 and test_projections.py 6/6 on a fresh workspace; 12/12 backend guard checks (upload limit, day-limit default/bounds, duplicate time off, delete-me cascade, spotlight, PATCH /me)."

  - task: "Test-suite re-runnability (suite was stateful)"
    implemented: true
    working: true
    file: "backend/tests/backend_test.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "Against a non-empty database the suite failed on rerun: TestTimeOff re-posted a fixed date (now 409 by design) and TestRoles promoted the shared seeded staff account while TestInvites ran on the other xdist worker (assert 200 == 403). Flaky results made deploy verification unreliable."
      - working: true
        agent: "main"
        comment: "TestTimeOff clears its own leftover request for the fixed date first; TestRoles now promotes/reverts a throwaway invited account and deletes it afterwards. Verified: 3 consecutive parallel runs + a serial run, all 35/35 on a dirty database."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 5
  run_ui: true

test_plan:
  current_focus:
    - "Coolify deploy: repo config is ready (Dockerfile + guide); user must create/point the application in their Coolify instance and press Deploy"
    - "Post-deploy smoke: /health, /health/ready, SPA deep links, login, chat WebSocket"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Deployment readiness done. Notable finds: (1) uvicorn had no WebSocket library, so chat realtime could never work in the container — fixed and verified; (2) with a wrong MONGO_URL the app reported healthy while hanging every request — now /health/ready returns a diagnostic 503 in 5s and the client start-up timeout is 5s; (3) the SPA is now served by FastAPI in the all-in-one image (deep links, hashed-asset caching, traversal-safe). I cannot reach the user's Coolify instance — docs/DEPLOYMENT.md has the exact settings (Build Pack Dockerfile, Base Directory /, Dockerfile Location /Dockerfile, Ports Exposes 8000, health check /health, env MONGO_URL/DB_NAME/JWT_SECRET/ADMIN_BOOTSTRAP_CODE) for both the single-app and split topologies. Only docker-free static checks were possible for the Dockerfiles/nginx template (no docker daemon here); everything else was executed against the real app."
