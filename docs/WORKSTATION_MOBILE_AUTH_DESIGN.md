# Workstation sign-in, native phone app, and on-site Chat alerts

Status: design for review. The web app does not yet enforce this authentication or notification flow, and no native mobile build includes it.

## Experience

1. A teammate enrolls one or more iPhone or Android devices after accepting a manager-issued invitation. The native app remains signed in across launches. A lost device can be revoked from another enrolled device or by an administrator.
2. At a hospital workstation, the teammate enters email and password. The service creates a short-lived pending sign-in and shows a two-digit number. A generic push opens the native app; the app displays the workstation and matching number, then asks for device biometrics or the device PIN before approval.
3. The service issues a web-only session after the phone approves. The browser warns before expiry, then returns to sign-in after 60 minutes without user interaction. The timeout is an administrator setting, initially 60 minutes, constrained to 15–120 minutes. A separate 12-hour absolute limit ends sessions that remain active all day.
4. Chat has one hospital-wide group. All messages remain visible to signed-in teammates. The native app sends a minimal, recent at-work status when its optional geofence changes. The service sends Chat push alerts only to devices with a fresh at-work status. Sign-in approvals are delivered regardless of geofence status.

## Service changes

| Area | Required change |
| --- | --- |
| Enrollment | Require an invitation for teammate registration; register a device public key while its private key stays in protected phone storage; support device listing, revocation, and recovery codes. |
| Workstation sign-in | Add begin, status, approve/deny, and exchange endpoints. Challenges are single-use, bound to the initiating browser, rate-limited, signed by the enrolled device, and expire after two minutes. Never return an access token before approval. |
| Web sessions | Store an opaque session ID and last user activity on the server. Use a Secure, HttpOnly, SameSite cookie plus CSRF protection. Enforce idle and absolute expiry on each request; background polling must not extend the idle clock. |
| Mobile sessions | Store a device-scoped refresh credential in iOS Keychain/Android Keystore, rotate it on use, and allow remote revocation. “No logout” means no routine forced sign-out, not a never-expiring bearer token. Require a device unlock before approving a workstation sign-in. |
| Chat | Make one canonical hospital group and route existing group data through an explicit migration plan; do not silently merge private groups. |
| Alerts | Register push tokens per device; report only campus ID, inside/outside/unknown, and observation time. Suppress work-only pushes when the status is unknown or stale. Send generic lock-screen text with no patient details. |
| Settings | Let admins edit the workstation idle timeout and campus geofence center/radius. Maintain an audit trail for sign-in approvals, device enrollment/revocation, and timeout policy changes. |

The current implementation uses a seven-day JWT in browser `localStorage`, has no phone approval or server-side session revocation, and supports multiple user-created chats. Teammate registration requires a valid invitation code after setup.

## Geofence behavior

- A campus is a circular region; start with a 200 m radius and adjust during device testing. Multiple campuses can each have a region.
- Location permission is requested only when the teammate enables “On-site Chat alerts.” Background permission is needed for enter/exit updates while the app is not open.
- Store the current presence state and timestamp, not a coordinate trail. Refresh presence when the app opens and while background execution is permitted. Expire it after a short interval so an old “inside” report cannot keep alerts enabled after a phone stops updating.
- Message delivery and unread counts are never gated by location. Only push alerts are gated. A teammate outside the campus still sees Chat when opening the app.
- Geofence signals are best-effort. Mobile operating systems can delay or stop background events, especially when an app is terminated; stale/unknown status must fail closed for work-only alerts. A manual, time-limited “On shift” override could be added if missed alerts prove operationally costly, but should be separately authorized.

## Implementation order and acceptance checks

1. Finish the Expo native client foundation: service URL configuration, invitation-based account enrollment, secure mobile session storage, Chat, and device settings.
2. Replace browser authentication with pending phone approval and server-enforced sessions. Verify no API access before approval, number matching, replay rejection, denial, expiry, remote device revocation, and 60-minute idle logout. Add administrator timeout controls.
3. Create the single canonical Chat group and a migration path for existing groups. Add native push registration and on-site presence reports. Verify alerts arrive inside the campus and are suppressed outside or with stale/denied location permission; messages remain readable everywhere.
4. Test on physical iPhone and Android development builds. Background geofencing and push behavior cannot be validated solely in a browser or Expo Go. Keep the service and builds private until a separate release approval.

## References

- [GitHub Mobile 2FA uses public-key cryptography](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication).
- [OWASP session guidance: server-side idle and absolute timeouts](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [Expo Location: background geofencing permissions and platform limits](https://docs.expo.dev/versions/latest/sdk/location/).
- [Expo Push Service: delivery and receipt handling](https://docs.expo.dev/push-notifications/sending-notifications/).
