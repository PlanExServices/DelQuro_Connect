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

- The web UI has local preview improvements; the Expo native project is a starter. The phone approval flow, configurable one-hour web sessions, canonical group migration, and on-site push alerts remain designs rather than completed features. Check the [README implementation status](../README.md#implementation-status-read-me-first) before claiming a feature works.
- The working name remains provisional while the owner and team consider names.

## Campus identity and survey (October 2026)

- The owner specified **COMMON** as Commonwealth Animal Hospital's short company/campus ID tag. A campus should use its own website branding and logo. Other hospitals should follow the same configurable format; COMMON is a reference profile, not the universal brand. See [campus branding](CAMPUS_BRANDING.md).
- **Tools and Settings are one destination** with a gear entry point. Chat remains a main mobile tab; the Huddle tab remains mandatory.
- The owner's veterinary workplace survey is at [survey.delqurolabs.app](https://survey.delqurolabs.app/). It asks about one real shift moment, the blocker, effects, and workarounds. Its questions are research input; no synthetic response was submitted during review. The originally provided `servey` spelling failed certificate validation.
