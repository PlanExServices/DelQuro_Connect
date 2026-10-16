# Campus branding in the private preview

The product keeps one app structure while each hospital campus supplies its own identity. **COMMON** is the ID tag for the Commonwealth Animal Hospital reference campus in Midlothian, VA. The product name remains undecided; COMMON is a campus identifier, not a replacement product name.

## COMMON reference profile

| Field | Preview value | Source |
| --- | --- | --- |
| Campus name | Commonwealth Animal Hospital | [Hospital website](https://www.commonwealthanimal.com/) |
| ID tag | COMMON | Product owner |
| Website | `https://www.commonwealthanimal.com/` | Hospital website |
| Logo | `frontend/public/brands/commonwealth.svg` | [Hospital logo](https://www.commonwealthanimal.com/_files/images/logo-small.svg), copied for local preview on October 8, 2026 |
| Primary control color | `#2B2F88` | Website `--accent: 237, 52%, 35%` |
| Accent color | `#811317` | Website `--primary: 358, 74%, 29%` |
| Soft surface | `#E4EEF1` | Website `--shade: 194, 32%, 92%` |

The app uses the dark blue for primary controls and headings, burgundy for accents, and the pale blue for selected surfaces. The hospital logo and COMMON tag appear in the signed-in header and the combined Tools & Settings screen. DelQuro Connect remains the generic sign-in identity until a final product name is chosen.

## Configuring another campus

An administrator opens **Tools & Settings → Campuses & Branding** and adds a hospital name, unique alphanumeric ID tag, website, logo URL, and three colors. The URL fields accept HTTPS; a logo can also use a packaged `/brands/` asset. Existing profiles can be edited, and teammates can be assigned to a campus. An invitation now carries a saved campus assignment when one is selected, so a new teammate starts with the right identity.

The backend stores the profile on the location record. The frontend chooses the signed-in teammate's assigned location and applies its logo and colors. If there is only one saved campus, an unassigned review user sees that campus until assigned. The local preview also shows the COMMON reference profile before a campus record is saved; this fallback is disabled outside localhost.

For a workstation sign-in link, `/login?campus=COMMON` reads only the public display profile and shows the campus logo and colors before authentication. A different campus code uses its own saved profile. The local preview shows COMMON on its sign-in screen by default so the concept is easy to review.

## Rollout boundary

This is a branding and assignment pattern, **not full customer isolation**. Existing Huddle, Chat, schedules, and other records are not yet partitioned by hospital. Before onboarding unrelated hospitals to one service, every data route and administrative permission needs organization scope and tests. Public use of the COMMON logo should follow the hospital's brand approval process.
