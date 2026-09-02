# LG Seller Lounge: UX scenario and self-checklist draft

This document is a preparation draft. LG still requires the publisher to complete the Seller Lounge fields, provide the final test account/configuration and submit the official self-checklist in the current Seller Lounge workflow.

## UX scenario

### Purpose

Nuvio TV is a TV-first media organizer for movies and series. It lets users discover titles from their configured catalogs, save them to a library, track progress and open a configured playable source in the TV player.

### Primary user flow

1. Launch the app and select an existing profile or create a profile.
2. Browse Home using the LG remote; the focused hero and content rows show title metadata and artwork.
3. Open Search, type or dictate a title, and select a result.
4. Save a title to the local library or open a configured source.
5. Start playback and use audio/subtitle controls where the source and TV platform support them.
6. Open Settings to manage profiles, appearance, playback, integrations and tracking.
7. Return to Home, close/relaunch the app and verify profile/library/progress persistence.

### Content and source disclosure

Nuvio TV does not host or provide video content. Catalogs and playable links are supplied by the user’s configured add-ons and supported services. Availability of a source, audio, subtitles, DRM and advanced playback depends on the source, TV model and webOS version.
Torrent/P2P playback, where available on the submitted webOS package, uses only the bundled local companion service; no external torrent streaming server is configured.

### Required QA input from the publisher

- Seller Lounge account and legal/publisher information.
- Publisher/support starting values copied from the Nuvio Google Play listing: `Nuvio Media`, Muhammed Nayif Rahman, India, `nayiftapframe@gmail.com`, `https://nuvioapp.space`, privacy policy `https://nuvio.tv/privacy-policy`.
- Final privacy/support URLs and content rating.
- Test account, if account-based flows are included in the submission.
- Provider/add-on configuration and a lawful test source that can be replayed by LG QA.
- Target country/model selection and final release version. Mirror the production country list currently enabled for `com.nuvio.app` on Google Play, subject to the countries and model groups available in LG Seller Lounge.
- The web build ships UI translations for 30 locales: English, Arabic, Bosnian, Czech, German, Greek, Spanish, Spanish (Latin America), French, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Lithuanian, Dutch, Norwegian, Polish, Portuguese (Brazil), Portuguese (Portugal), Romanian, Russian, Slovak, Slovenian, Swedish, Tamil, Turkish, Vietnamese and Chinese (Simplified). Seller Lounge language entries and translated metadata can be completed after the English base submission.

## App Self Checklist draft

| Area                              | Draft status            | Evidence / action                                                                     |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| App launches from a clean install | Ready for device test   | Verify the signed IPK on webOS 5+ devices.                                            |
| App icon and splash resources     | Ready locally           | `appinfo.json`, 80x80/130x130 icons, 1920x1080 splash; Seller Lounge icon is 400x400. |
| Remote navigation and focus       | Ready for device test   | Run the Home/Search/Library/Settings flow with Magic Remote and directional input.    |
| Back/Home behavior                | Ready for device test   | Verify each route, modal and player exit path.                                        |
| Network failure states            | Ready for device test   | Test offline start, catalog timeout and source failure without a stuck overlay.       |
| Playback                          | Publisher test required | Supply lawful direct/HLS/HTTP test sources and verify real LG hardware.               |
| Audio/subtitles                   | Publisher test required | Verify supported formats; do not certify unsupported advanced styling by assumption.  |
| Accounts/integrations             | Publisher test required | Supply exact account/provider state used by LG QA.                                    |
| Privacy/support/rating            | Missing publisher data  | Fill Seller Lounge with verified legal information.                                   |
| Performance/memory                | Requires real-device QA | Test cold launch, long browse session, player exit and relaunch on target models.     |
| Store metadata/screenshots        | Ready as draft          | Replace any placeholder legal/contact/rating fields before submission.                |

## Official references

- [LG App Resources](https://webostv.developer.lge.com/develop/getting-started/app-resources)
- [LG appinfo.json reference](https://webostv.developer.lge.com/develop/references/appinfo-json)
- [LG Approval Process](https://webostv.developer.lge.com/distribute/app-approval-process)
- [LG App Self Checklist](https://webostv.developer.lge.com/distribute/app-self-checklist)
- [LG supported app resolution](https://webostv.developer.lge.com/develop/specifications/app-resolution)
