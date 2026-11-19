# DelQuro Connect mobile release

## Staff testing decision

DelQuro Connect is limited to named staff testers for this beta. Production availability remains a separate decision.

- Use the `staff-test` EAS build profile for both stores. It uses the Preview environment, store signing and build-number increments. Its Android output is an App Bundle. The `preview` profile still produces a direct-install APK or ad hoc iOS build. Set `EXPO_PUBLIC_CONNECT_URL` in the Preview environment to the approved HTTPS pilot service running this backend. Use a separate database and keep example origins for local build verification. [EAS build profiles](https://docs.expo.dev/build/eas-json/)
- Use a named TestFlight group with email invitations. An Internal Testing group is suitable for staff who already have an eligible App Store Connect role, up to 100. Use a named external group for other clinic staff, with a normal distribution build, an internal group already created and first-build Beta App Review. Provide reviewer access to the synthetic workspace and avoid a public invitation link. [Internal TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers) · [External TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)
- Use Google Play Internal Testing with an email allowlist of up to 100 staff and the private opt-in link. Confirm the developer account, package registration and upload key before the first upload fixes the package name. For new apps, use Play App Signing. Google holds the delivered-app signing key and verifies the separate upload key. [Internal testing](https://support.google.com/googleplay/android-developer/answer/9845334) · [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) · [Package registration](https://support.google.com/googleplay/android-developer/answer/16984799)
- Use the release candidate's [audit](STORE_REQUIREMENTS_AUDIT.md) to check platform, policy and security status before selecting a build in either console.

## Release scope

DelQuro Connect is an invitation-only workplace app. The mobile candidate uses native Huddle, Time Off, Schedule and Chat screens against one configured workspace. Teammates can acknowledge protocols, see monthly staffing capacity, submit and cancel pending time-off requests, open schedule files, and read and send messages. Managers use the web app to create Huddle posts, upload schedules, manage invitations and approve time off.

Administrators can review reports and their attachments in Settings, remove content, and suspend or restore access. Assign someone to monitor the queue and public support inbox. The server’s `MODERATION_BLOCKED_PHRASES` variable accepts additional phrases separated by `|`. Review the filter and the team’s process for abusive images before release.

The service stores one workspace’s data per deployment. Use a separate backend and database for store review. Multiple independent clinics on one shared instance require a separate tenancy implementation. The [workstation sign-in and on-site Chat alerts design](WORKSTATION_MOBILE_AUTH_DESIGN.md) tracks phone approval, the single hospital-wide Chat migration, push alerts and geofencing.

## Build and account setup

1. Confirm the listing name and provisional `app.delqurolabs.connect` identifier in both stores before reserving it. The candidate targets iPhone and Android phones. Choose the distribution method and countries before creating production records. Apple has public, unlisted and organization-specific distribution options. Google offers public and managed private distribution. [Apple distribution methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods) · [Managed Google Play private apps](https://support.google.com/googleplay/work/answer/9146439)
2. Link `mobile/` to the approved Expo project or use an approved local signing setup. For staff testing, build with `eas build --platform all --profile staff-test` from `mobile/` after signing and environment setup. The `production` profile uses the Production environment for eventual broader submission. Set `EXPO_PUBLIC_CONNECT_URL` to the approved HTTPS origin and `EXPO_PUBLIC_CONNECT_REVIEW_URL` to the separate HTTPS review origin when needed. Both are compiled into the app. Keep signing secrets and reviewer credentials in their respective portals or credential stores.
3. Build iOS with the current App Store Connect SDK and Android with target API 36 or higher. Expo SDK 57 targets Android 36. Check the actual iOS archive for the SDK, bundle ID, privacy manifests, required-reason API declarations, release entitlements and export compliance. Verify the Android AAB’s package, target SDK, Play upload signature and 16 KB ZIP and ELF alignment, then test on a 16 KB image. [Apple SDK requirements](https://developer.apple.com/news/upcoming-requirements/) · [Expo SDK support](https://docs.expo.dev/versions/latest/) · [Google Play target API](https://support.google.com/googleplay/android-developer/answer/11926878) · [Android 16 KB validation](https://developer.android.com/guide/practices/page-sizes)
4. Use TestFlight and Google Play Internal Testing with approved signed candidates. For personal Play accounts created after November 13, 2023, check the production-access rule for a closed test with at least 12 testers continuously opted in for 14 days. [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)

## Store metadata draft

| Field | Draft |
| --- | --- |
| Name | DelQuro Connect |
| Apple subtitle | Veterinary team coordination |
| Play short description | Huddle, schedules, time off, and chat for invited veterinary teammates. |
| Primary category | Business |
| Apple keywords | veterinary,staff,schedule,shift,huddle,time off,team chat |

**Description**

DelQuro Connect gives veterinary hospital teammates one place to coordinate their shifts. Read Huddle announcements and acknowledge new protocols, check posted schedules, request a full day off, and keep in touch through team Chat.

Sign in with your workspace account or use an invitation from your administrator. Availability depends on your hospital’s workspace.

**Listing assets and URLs**

- Use the supplied [Play icon](../mobile/store/play-icon.png) and [feature graphic](../mobile/store/feature-graphic.png) after owner approval. The iOS icon is included in the build.
- Capture Huddle, Time Off, Schedule and Chat on the current iPhone and Android candidates with synthetic data. Check the screenshot slots and required sizes in each console. [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) · [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- Verify `/privacy`, `/support`, `/account-deletion` and `/community-guidelines` from a signed-out browser on the approved HTTPS service. Enter `/account-deletion` in Play Console as the public deletion URL. Confirm the operator, support address, hosting providers, backups, retention and deletion exceptions before publishing the policy.

**Privacy and content worksheet**

Review the exact binary, backend and hosting configuration before certifying Apple App Privacy or Google Play Data safety. Confirm which fields are required or optional and what processors retain. Declare team messaging and uploaded content in the applicable content and age-rating forms. [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) · [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Play user-generated content](https://support.google.com/googleplay/android-developer/answer/9876937)

| Data | Use and handling |
| --- | --- |
| Name, work email, user ID, role, campus, optional profile fields and preferences | Account management and team coordination. Stored with the workspace account. |
| Password hash, session digest, terms acceptance and failed sign-ins | Authentication, access control and abuse prevention. The native device keeps a refresh credential in secure storage. |
| Posts, comments, messages, images, schedule files, acknowledgments and reports | Workspace communication and moderation. Access is scoped by workspace or chat membership. |
| Time-off dates, statuses and optional reason | Staffing. The native calendar shows aggregate capacity and the teammate’s own requests. |
| Deleted account data | Profile data and authored content are removed from active service. Operational schedules may remain with uploader identity detached. Confirm backup expiration and handling of information embedded in shared documents. |
| Device permissions and SDKs | The candidate uses no push, location, camera, microphone, advertising or tracking integration. Verify the final manifests and any platform and hosting diagnostics. |

## Review and device acceptance

- Provision a persistent review-only backend with a separate MongoDB database, synthetic staff accounts, and populated Huddle, schedule, time-off and Chat records. In both portals, tell reviewers to choose **Open demo workspace** on the sign-in screen and use the credentials in the protected review fields. Provide a separate disposable account or invitation for deletion testing. Keep the main review account available throughout review. [Apple App Review](https://developer.apple.com/app-store/review/guidelines/) · [Google Play app content](https://support.google.com/googleplay/android-developer/answer/9859455)
- Verify invite use, sign-in, cold launch with a saved session, expiry, sign-out and account deletion on both phones. Confirm that demo credentials and data stay separate from the team workspace.
- Acknowledge a protocol, submit and cancel time off, open image and PDF schedules, and read and send Chat messages after accepting the guidelines. Report and block a teammate. Verify the administrator can review a reported attachment and act on the report.
- Verify public links, external deletion, safe areas, keyboard behavior, large text, VoiceOver, TalkBack and handling of connectivity failures on the signed candidate. Capture store screenshots after the flows pass.
- Submit for review after signing, reviewer access, disclosures, metadata, assets and device evidence are complete.
