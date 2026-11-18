# Project context and decisions

This file is the durable project brief for future work in this repository. Update it when the product owner makes a decision; keep proposed ideas separate from approved requirements. For implementation details and current gaps, see the [README](../README.md) and [mobile authentication design](WORKSTATION_MOBILE_AUTH_DESIGN.md).

## Product and customer context

- This is a DelQuro Labs product being developed for veterinary hospital teams. The owner may propose it to Mission Pet Health, but no MPH affiliation or endorsement should be implied in product branding or preview copy.
- Mission Pet Health combines Southern Veterinary Partners and Mission Veterinary Partners. The reference hospital is **Commonwealth Animal Hospital, 4721 Market Square Lane, Midlothian, VA 23112**. Do not confuse it with same-named hospitals in Charlotte or Fairfax.
- The product owner works in hospital management and is designing for the *whole team*: client service, assistants, technicians, veterinarians, and managers.
- Public research on hospital work, emotional load, competitors, and naming criteria is recorded in the [veterinary team and naming brief](VETERINARY_TEAM_NAMING_BRIEF.md). Public information is not evidence of this hospital's internal routines.

## Product direction confirmed by the owner

- Team Chat is a central feature. The **Huddle tab is mandatory**. The app also includes schedules, time off, and tools.
- Teammates should have a native iPhone and Android app that signs in to the web service. A hospital workstation should open the web app and complete sign-in through approval on the teammate's phone, similar to GitHub's phone approval experience.
- The workstation web session should log out after **one hour by default**, with an editable timeout. The native app should stay signed in between uses. The [design](WORKSTATION_MOBILE_AUTH_DESIGN.md) specifies secure session rotation and device revocation to make that experience possible.
- Chat should have **one hospital-wide group**. Geofencing should control **work-only Chat alerts**, not access to messages. Teammates can read Chat away from the hospital; ordinary work alerts should reach them only when at work.
- The owner approved pushing the current web release live on October 16, 2026. Verify the destination and health before describing it as deployed. Use only authorized accounts or an agent-only synthetic demo login for review.

## Naming decisions

- **DelQuro Connect** is the original and current preview name. The owner finds DelQuro hard for others to spell and wants a short, memorable, professional name. The final name is still a joint decision.
- **VetHuddle is excluded as a product name** because it sounds too close to “cuddle” and could be rejected in an HR setting. This does **not** apply to the required Huddle tab.
- **MPH-Connect.com** was suggested by the owner. A naming consideration, not a settled decision, is whether the product name should be independent of this prospective customer and avoid implying MPH sponsorship.
- A preliminary category scan found other veterinary products using “Connect.” Treat all candidates as provisional until proper domain and trademark review.

## Current implementation boundary

- The Expo mobile candidate provides native teammate workflows. The [mobile release record](MOBILE_STORE_RELEASE.md) covers distribution, disclosure and device gates. The phone approval flow, configurable one-hour web sessions, canonical group migration and on-site push alerts remain design work.
- The working name remains provisional while the owner and team consider names.

## Campus identity and survey (October 2026)

- The owner specified **COMMON** as Commonwealth Animal Hospital's short company/campus ID tag. A campus should use its own website branding and logo. Other hospitals should follow the same configurable format; COMMON is a reference profile, not the universal brand. See [campus branding](CAMPUS_BRANDING.md).
- **Tools and Settings are one destination** with a gear entry point. Chat remains a main mobile tab; the Huddle tab remains mandatory.
- The owner's veterinary workplace survey is at [survey.delqurolabs.app](https://survey.delqurolabs.app/). It asks about one real shift moment, the blocker, effects, and workarounds. Its questions are research input; no synthetic response was submitted during review. The originally provided `servey` spelling failed certificate validation.

## Production deployment (October 16, 2026)

- The owner supplied `coolify.delquro.com`; its DelQuro Connect production application automatically deploys GitHub `main`.
- Live service: `https://delquroconnect.delqurolabs.app`. COMMON sign-in: `/login?campus=COMMON`.
- The production COMMON campus profile is configured with the approved reference branding. No teammate accounts were created or reassigned during deployment.
- The frontend and backend run in one container. `REACT_APP_BACKEND_URL` must be empty at build time; the former `api.delqurolabs.app` value used the wrong API.
- An inherited Emergent/PostHog session-recording script was removed during release verification. Browser zoom is enabled.
- Sign-in remains accessible when the service needs its first administrator. Show a separate setup option; do not redirect `/login` back to `/setup`, which traps the setup page's Sign in link in a loop.

## Framework security update prepared (November 17, 2026)

- Prepared FastAPI 0.163.1 and Starlette 1.10.0 pins for the Coolify finding requiring Starlette 1.3.1 or later. The local development seeder now registers its startup handler through the same `on_event` API already used by the server.
- Local checks on Python 3.12.10 passed dependency resolution, `pip check`, compilation, the registration-gate smoke, all 11 `test_changes.py` checks, and five of six `test_projections.py` checks. Each test module used the configured two xdist workers against an isolated in-memory loopback server. Running both modules together races their shared admin birthday fields.
- The remaining projection test expects registration without an invitation to succeed. It fails with the same invitation-required response on both the original FastAPI 0.110.1 / Starlette 0.37.2 stack and the upgraded stack. The existing invitation requirement remains in force.
- Focused local probes passed all health/readiness aliases, anonymous API protection, fixture login and account lookup, anonymous WebSocket denial, authenticated typing and message broadcasts, and the documented six-member development seeder startup.
- Production deployment, a Linux Python 3.11 container build, and production user sign-in have not been verified for this update. The broader authentication work in open PR #4 is separate from this dependency change.

## MongoDB driver security update prepared (November 17, 2026)

- The subsequent image scan requested PyMongo 4.18.3 or later. Prepared `motor==3.7.1` and `pymongo==4.18.3`, keeping the existing Motor API and selecting the minimum scanner-fixed PyMongo release. [Motor's official package metadata](https://pypi.org/pypi/motor/3.7.1/json) requires PyMongo `>=4.9,<5`; [PyMongo 4.18.3 metadata](https://pypi.org/pypi/pymongo/4.18.3/json) supports Python 3.9 or later. Both releases reported no vulnerabilities in PyPI metadata at verification time; this is not a replacement for a new deployed-image scan.
- Fresh isolated Windows Python 3.12.10 installation, `pip check`, compilation, and the registration-gate smoke passed. The existing modules ran separately with their configured two xdist workers: `test_changes.py` passed all 11 checks; `test_projections.py` passed five and retained the invitation-required registration failure. A fresh server using the unchanged baseline Motor 3.3.1 / PyMongo 4.6.3 pair reproduced that exact failure (`400`, invitation code required).
- Loopback-only API checks passed all health/readiness aliases, anonymous API protection, synthetic fixture login/account lookup, anonymous WebSocket denial, authenticated typing and message broadcasts. A separate MockupDB 1.8.1 wire-protocol probe exercised the actual upgraded Motor/PyMongo client: handshake, ping, BSON ObjectId insert, filtered/projected/sorted/limited find, atomic update, aggregation, and deletion. No real MongoDB instance, provider, production account, or production data was used.
- Linux x86-64 Python 3.11 wheel resolution/download passed for the driver pair and its dependency. A Linux Python 3.11 container run and real MongoDB compatibility were not tested locally. Publication, production deployment, and the follow-up image scan remain pending approval and execution.
