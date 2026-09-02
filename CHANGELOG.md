## 1.0.4

### Improvements & Fixes

- Hardened Continue Watching, library loading, and remote progress state so profile changes and delayed synchronization do not replace valid TV content with a temporary empty view (@WhiteGiso)
- Aligned plugin execution with Android behavior by preserving eligible provider work in a cancellable queue and isolating legacy plugin data and migrations per profile (@WhiteGiso)
- Improved Home hero metadata and artwork transitions, Tizen live HLS fallback, and Library/Plugins focus restoration for Samsung TV navigation (@WhiteGiso)
- Added a controlled Tizen PluginService fallback through the working EngineFS service, resilient service-ID resolution, runtime diagnostics, and duplicate-port handling while keeping both local APIs separate (@WhiteGiso)
- Strengthened Tizen WGT packaging and Samsung installer validation so the PluginService files, bridge, manifest declarations, and EngineFS compatibility host are checked before installation (@WhiteGiso)

## 1.0.3

### Improvements & Fixes

- Finalized the Tizen plugin-service lifecycle, packaging contract, local health probing, launcher fallbacks, plugin HTTP playback proxy, and localized plugin UI handling (@WhiteGiso)
- Scoped plugin repositories, provider code, and cloud synchronization to the effective profile, including revision and dirty-state protection against cross-profile updates (@WhiteGiso)
- Preserved profile-bound local repository changes during remote reconciliation so stale snapshots cannot overwrite recent TV updates (@WhiteGiso)
- Moved provider-code caching from synchronous `localStorage` to profile-keyed asynchronous IndexedDB with bounded eviction, memory fallback, cleanup handling, authentication/profile integration, and the required Tizen storage privilege (@WhiteGiso)
- Restored the existing detail route after playback, targeting the correct history entry and avoiding duplicate detail screens while retaining stream cleanup (@WhiteGiso)
- Removed test programs and plugin fixtures from tracked application directories, keeping local test assets exclusively under the ignored root `tests/` directory (@WhiteGiso)
