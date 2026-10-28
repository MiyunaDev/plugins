# Universal Plugin Ecosystem — Implementation Roadmap (TODO)

This document tracks all engineering tasks across the implementation lifecycle of the Universal Plugin Ecosystem. Each task includes clear acceptance criteria, dependencies, priority, and current status.

---

## Priority Classification
- **`P0`**: Critical path; mandatory foundation for architectural coherence, safety, and core contracts.
- **`P1`**: Core milestone; required for the minimum viable plugin runtime and initial client integration.
- **`P2`**: Important follow-up; extends capabilities, performance, and multi-client adapters.
- **`P3`**: Future experiment, enhancement, or optional optimization.

## Status Definitions
- `TODO`: Planned and specified; ready for implementation.
- `IN_PROGRESS`: Actively under development.
- `BLOCKED`: Awaiting an external dependency or unresolved prerequisite.
- `DONE`: Implemented, tested, and verified against acceptance criteria.

---

## Phase 0 — Repository and Architecture Preparation

- [x] **ARCH-001**: Inspect repository structure and document multi-client constraints
  - **Objective**: Analyze existing client projects (`Glacier`, `Hanatsuki`, `Kiirohana`, `Matcha`, `Cactus`) and core microservices (`Partisier-Rewritten`) to establish architecture baseline.
  - **Actions**:
    1. Inspect directory layout, technology stacks, and package files across client repositories and the plugins ecosystem.
    2. Confirm separation between core platform services and optional extensions.
    3. Document findings in initial architectural overview.
  - **Acceptance Criteria**: Verified facts documented without false claims of implementation; directory boundaries established.
  - **Dependencies**: None.
  - **Relevant Files**: [`plugins/README.md`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/README.md), [`plugins/docs/architecture-overview.md`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/docs/architecture-overview.md).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **ARCH-002**: Author foundational Architecture Decision Records (ADRs)
  - **Objective**: Establish documented consensus on package format, sandboxing, broker protocol, native adapters, and external connectors.
  - **Actions**:
    1. Draft ADR-0001 (Package format and manifest schema).
    2. Draft ADR-0002 (Execution isolation and UI sandboxing).
    3. Draft ADR-0003 (Capability broker and JSON-RPC 2.0 bridge).
    4. Draft ADR-0004 (Native capabilities and Naviah Sync strategy).
    5. Draft ADR-0005 (External service connectors and credentials).
  - **Acceptance Criteria**: ADRs published with clear status, context, options considered, trade-offs, and consequences.
  - **Dependencies**: ARCH-001.
  - **Relevant Files**: [`plugins/docs/adr/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/docs/adr/).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **ARCH-003**: Create domain glossary and tripartite separation specification
  - **Objective**: Prevent conceptual confusion between Artifact Types, Contribution Types, and Capabilities.
  - **Actions**:
    1. Define core terminology for all stakeholders.
    2. Document formal boundaries of the tripartite model.
  - **Acceptance Criteria**: Glossary document established and linked in README.
  - **Dependencies**: ARCH-001.
  - **Relevant Files**: [`plugins/docs/glossary.md`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/docs/glossary.md).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **ARCH-004**: Publish project README and actionable master TODO roadmap
  - **Objective**: Establish canonical entry point for the plugin ecosystem repository.
  - **Actions**:
    1. Author comprehensive `README.md` conforming to all 17 specification requirements.
    2. Author granular, phased `TODO.md` roadmap.
  - **Acceptance Criteria**: Files reviewed and linked without broken references or unverified claims.
  - **Dependencies**: ARCH-001, ARCH-002, ARCH-003.
  - **Relevant Files**: [`plugins/README.md`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/README.md), [`plugins/TODO.md`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/TODO.md).
  - **Priority**: `P0`
  - **Status**: `DONE`

---

## Phase 1 — Shared Contracts

- [x] **CONT-001**: Author canonical JSON Schema for `plugin.json` manifest
  - **Objective**: Define machine-verifiable schema for plugin metadata, engine requirements, artifacts, contributions, and capability declarations.
  - **Actions**:
    1. Create `schemas/v1/plugin.schema.json` following JSON Schema Draft 2020-12.
    2. Add validation rules for semver, reverse-domain identifiers (`org.example.plugin`), and contribution schemas.
    3. Include positive and negative test fixture JSON files.
  - **Acceptance Criteria**: Schema validator tests pass against valid manifests and fail with descriptive errors on invalid manifests.
  - **Dependencies**: ARCH-002.
  - **Relevant Files**: [`plugins/schemas/v1/plugin.schema.json`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/schemas/v1/plugin.schema.json), [`plugins/tests/fixtures/manifests/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/tests/fixtures/manifests/).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **CONT-002**: Define typed JSON-RPC 2.0 schema for Capability Broker protocol
  - **Objective**: Specify formal request, response, error, and notification payload types for all host-plugin communication.
  - **Actions**:
    1. Create TypeScript types and JSON Schemas for `broker.invoke`, `broker.subscribe`, `broker.getCapabilities`.
    2. Standardize error codes (`-32000` to `-32099` for capability errors, permission denied, quota exceeded).
  - **Acceptance Criteria**: Schema validates 100% of standard protocol messages.
  - **Dependencies**: ARCH-002, CONT-001.
  - **Relevant Files**: [`plugins/packages/contracts/src/rpc.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/contracts/src/rpc.ts), [`plugins/schemas/v1/rpc.schema.json`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/schemas/v1/rpc.schema.json).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **CONT-003**: Standardize Plugin Lifecycle State Machine contract
  - **Objective**: Codify the formal lifecycle states (`UNINSTALLED`, `INSTALLED`, `INACTIVE`, `ACTIVATING`, `ACTIVE`, `DEACTIVATING`, `ERROR`) and transition hooks.
  - **Actions**:
    1. Write formal state transition table and transition guard functions.
    2. Define hook interfaces (`onInstall`, `onActivate`, `onDeactivate`, `onUninstall`).
  - **Acceptance Criteria**: Unit tests cover all permitted state transitions and prevent illegal transitions (e.g. `UNINSTALLED` -> `ACTIVE`).
  - **Dependencies**: CONT-002.
  - **Relevant Files**: [`plugins/packages/contracts/src/lifecycle.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/contracts/src/lifecycle.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **CONT-004**: Define Capabilities and Permissions catalog
  - **Objective**: Establish the taxonomy of standard capability identifiers and their constraint parameters.
  - **Actions**:
    1. Specify schemas for `storage.local`, `network.fetch`, `device.naviah-sync`, `ui.route`, `ui.widget`, `event.bus`.
    2. Define parameter constraints (e.g., maximum quota sizes, domain wildcards).
  - **Acceptance Criteria**: Every capability identifier is documented with permissions, risk level, and schema definition.
  - **Dependencies**: CONT-001.
  - **Relevant Files**: [`plugins/packages/contracts/src/capabilities.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/contracts/src/capabilities.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

---

## Phase 2 — Minimal Plugin Runtime

- [x] **RUN-001**: Implement `.mpk` archive unpacker with anti-Zip-Slip validation
  - **Objective**: Safely unpack standard zip archives into namespaced target directories on the host client.
  - **Actions**:
    1. Implement streaming zip unpacker.
    2. Reject archives containing `..` paths, absolute paths, or invalid symlinks.
    3. Verify per-file SHA-256 hashes against `checksums.json`.
  - **Acceptance Criteria**: Malicious test archives (Zip Slip attempts) are safely aborted without disk compromise; valid archives unpack cleanly.
  - **Dependencies**: CONT-001.
  - **Relevant Files**: [`plugins/packages/runtime/src/installer/unpacker.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/installer/unpacker.ts), [`plugins/packages/runtime/src/installer/packer.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/installer/packer.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **RUN-002**: Implement Local Plugin Manager and state persistence
  - **Objective**: Manage local installation registry, activation state, and user permission grant persistence.
  - **Actions**:
    1. Implement local database / key-value store for plugin records (`installedPlugins`, `activePlugins`, `grantedPermissions`).
    2. Implement `install()`, `uninstall()`, `activate()`, `deactivate()` methods.
  - **Acceptance Criteria**: State survives simulated client reboots; uninstalled plugins leave no orphaned storage.
  - **Dependencies**: RUN-001, CONT-003.
  - **Relevant Files**: [`plugins/packages/runtime/src/manager/plugin-manager.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/manager/plugin-manager.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **RUN-003**: Implement Capability Broker core dispatch and permission gate
  - **Objective**: Intercept incoming JSON-RPC calls and enforce permission rules before delegating to host providers.
  - **Actions**:
    1. Implement RPC dispatcher with timeout enforcement (default 10s).
    2. Verify calling plugin ID against active channel registration.
    3. Enforce permission verification against Local Plugin Manager grants.
  - **Acceptance Criteria**: Calls without granted permission immediately return `PERMISSION_DENIED` (-32001); authorized calls resolve to provider results.
  - **Dependencies**: RUN-002, CONT-002, CONT-004.
  - **Relevant Files**: [`plugins/packages/runtime/src/broker/broker.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/broker/broker.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **RUN-004**: Implement Namespaced Isolated Storage Provider
  - **Objective**: Provide secure, quota-enforced key-value storage isolated per plugin ID.
  - **Actions**:
    1. Implement storage adapter backed by host storage (IndexedDB on Web, SQLite/MMKV on mobile).
    2. Enforce manifest-declared storage quota limits (e.g. 10MB).
    3. Isolate keys so Plugin A cannot read Plugin B data.
  - **Acceptance Criteria**: Quota excess triggers `QUOTA_EXCEEDED` (-32002); cross-plugin key lookups fail.
  - **Dependencies**: RUN-003.
  - **Relevant Files**: [`plugins/packages/runtime/src/providers/storage-provider.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/providers/storage-provider.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

---

## Phase 3 — Minimal UI Extension & Sandbox

- [x] **UI-001**: Implement sandboxed Web iframe container component
  - **Objective**: Host web UI bundle artifacts inside an unprivileged context (`origin: null`).
  - **Actions**:
    1. Create standard web container component with strict sandbox attributes (`allow-scripts`, no `allow-same-origin`, no `allow-top-navigation`).
    2. Inject default Content Security Policy (CSP).
    3. Establish `MessageChannel` bridge between host broker and sandboxed frame.
  - **Acceptance Criteria**: Frame cannot access `window.parent.localStorage` or host DOM; communicates exclusively via `postMessage`.
  - **Dependencies**: RUN-003.
  - **Relevant Files**: [`plugins/packages/ui-host/src/container/iframe-container.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/ui-host/src/container/iframe-container.ts), [`plugins/packages/ui-host/src/bridge/sandbox-bridge.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/ui-host/src/bridge/sandbox-bridge.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **UI-002**: Implement namespaced route contribution mounting
  - **Objective**: Dynamically register and display plugin routes under `/ext/:pluginId/:route`.
  - **Actions**:
    1. Register route contributions from manifest upon plugin activation.
    2. Render sandboxed frame when user navigates to the plugin route.
    3. Unmount and unregister routes upon deactivation.
  - **Acceptance Criteria**: Navigating to registered route smoothly displays plugin UI; navigating away suspends or cleans up frame.
  - **Dependencies**: UI-001.
  - **Relevant Files**: [`plugins/packages/ui-host/src/router/plugin-router.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/ui-host/src/router/plugin-router.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **UI-003**: Build demonstration mini-game plugin
  - **Objective**: Create a reference arcade mini-game plugin packaged as `.mpk` to validate the UI sandbox.
  - **Actions**:
    1. Develop simple HTML5 Canvas game (e.g., retro snake or space shooter).
    2. Use `storage.local` capability via broker to persist high scores.
    3. Package with manifest and valid checksums.
  - **Acceptance Criteria**: Mini-game installs, runs at 60fps in sandbox, saves high score, and persists across reloads.
  - **Dependencies**: UI-001, UI-002, RUN-004.
  - **Relevant Files**: [`plugins/examples/mini-game-demo/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/examples/mini-game-demo/).
  - **Priority**: `P1`
  - **Status**: `DONE`

---

## Phase 4 — External Service Connector

- [x] **CONN-001**: Implement Network Proxy Provider with domain filtering
  - **Objective**: Allow approved plugins to communicate with external APIs and self-hosted instances while restricting arbitrary outbound scanning.
  - **Actions**:
    1. Implement broker network handler supporting `GET`, `POST`, `PUT`, `DELETE`.
    2. Check target domain against manifest `network.fetch` whitelist or user-approved IP addresses.
    3. Enforce request timeouts (default 15s) and response payload size caps.
  - **Acceptance Criteria**: Requests to non-whitelisted domains fail with `SECURITY_ERROR`; whitelisted requests succeed.
  - **Dependencies**: RUN-003.
  - **Relevant Files**: [`plugins/packages/runtime/src/providers/network-provider.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/providers/network-provider.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **CONN-002**: Implement Host Secure Credential Keyring provider
  - **Objective**: Store sensitive tokens (e.g. Jellyfin API tokens) in host-managed secure storage rather than plaintext plugin storage.
  - **Actions**:
    1. Implement credential store using native secure storage (Keychain/Keystore) or encrypted client storage.
    2. Allow plugins to reference credentials via opaque `credentialId` without exposing raw tokens to script context.
    3. Provide credential injection into outgoing proxy requests.
  - **Acceptance Criteria**: Raw tokens never logged; credential retrieval requires plugin owner identity match.
  - **Dependencies**: CONN-001.
  - **Relevant Files**: [`plugins/packages/runtime/src/providers/credential-provider.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/providers/credential-provider.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **CONN-003**: Build demonstration Jellyfin media server connector plugin
  - **Objective**: Validate the external connector architecture with a real-world self-hosted service integration.
  - **Actions**:
    1. Create connector plugin package that connects to a Jellyfin server instance.
    2. Implement server URL input, credential storage, and library catalog browsing.
    3. Include mock Jellyfin HTTP server for automated integration tests.
  - **Acceptance Criteria**: Connector connects to mock Jellyfin, fetches media items, and renders them in the plugin UI.
  - **Dependencies**: CONN-001, CONN-002, UI-002.
  - **Relevant Files**: [`plugins/examples/jellyfin-connector/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/examples/jellyfin-connector/), [`plugins/tests/mocks/jellyfin-server/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/tests/mocks/jellyfin-server/).
  - **Priority**: `P1`
  - **Status**: `DONE`

---

## Phase 5 — Capability Broker and Native Providers

- [x] **PROV-001**: Implement Native Capability Provider interface and registration lifecycle
  - **Objective**: Provide structured API for host clients to register native capabilities with the broker.
  - **Actions**:
    1. Define `ICapabilityProvider` interface in TypeScript/contracts.
    2. Implement dynamic provider registration and unregistration.
    3. Implement `broker.getAvailableCapabilities()` query handler.
  - **Acceptance Criteria**: Available capabilities are introspectable; missing capabilities return `UNSUPPORTED`.
  - **Dependencies**: RUN-003.
  - **Relevant Files**: [`plugins/packages/runtime/src/broker/provider-registry.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/broker/provider-registry.ts).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **PROV-002**: Specify and implement Mock Naviah Sync Provider
  - **Objective**: Provide a headless, deterministic mock provider for `device.naviah-sync` testing prior to native device integration.
  - **Actions**:
    1. Implement operations: `getSyncStatus`, `discoverPeers`, `startSync`, `cancelSync`.
    2. Simulate peer discovery, progress event emissions, and transfer completion.
    3. Add fault injection modes (timeout, connection loss, quota error).
  - **Acceptance Criteria**: Automated test suite validates sync lifecycle, progress events, and error recovery using mock provider.
  - **Dependencies**: PROV-001.
  - **Relevant Files**: [`plugins/packages/runtime/src/providers/sync-mock/mock-naviah-sync.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/runtime/src/providers/sync-mock/mock-naviah-sync.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **PROV-003**: Build Naviah Sync demonstration workflow plugin
  - **Objective**: Create a user-facing plugin that monitors and controls sync sessions using the `device.naviah-sync` capability.
  - **Actions**:
    1. Author UI showing discovered peers, sync progress bars, and start/cancel controls.
    2. Subscribe to sync progress events emitted through the broker.
  - **Acceptance Criteria**: UI reflects mock sync state transitions in real time.
  - **Dependencies**: PROV-002, UI-002.
  - **Relevant Files**: [`plugins/examples/naviah-sync-ui/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/examples/naviah-sync-ui/).
  - **Priority**: `P2`
  - **Status**: `DONE`

---

## Phase 6 — Client SDKs and Official Adapters

- [x] **SDK-001**: Publish `@miyuna/plugin-bridge` client library
  - **Objective**: Create zero-dependency lightweight TypeScript library for plugin authors to interact with the host broker.
  - **Actions**:
    1. Implement promise-based RPC client wrapping `window.postMessage`.
    2. Provide typed helpers: `miyuna.storage`, `miyuna.network`, `miyuna.sync`, `miyuna.events`.
    3. Bundle as lightweight UMD, ESM, and CJS.
  - **Acceptance Criteria**: Library size < 15KB minified; full TypeScript definitions exported.
  - **Dependencies**: CONT-002, CONT-004.
  - **Relevant Files**: [`plugins/packages/plugin-bridge/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/plugin-bridge/).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **SDK-002**: Implement Glacier (React/Vite Web) official host adapter
  - **Objective**: Integrate the plugin runtime into the primary web client.
  - **Actions**:
    1. Implement Glacier host adapter in `@miyuna/plugin-adapters` and export for web client consumption.
    2. Wire plugin navigation into Glacier's AppLayout.
    3. Test running the mini-game demo inside Glacier.
  - **Acceptance Criteria**: Mini-game runs smoothly inside Glacier web app without console errors or styling leaks.
  - **Dependencies**: UI-002, SDK-001, UI-003.
  - **Relevant Files**: [`plugins/packages/adapters/src/GlacierPluginHost.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/adapters/src/GlacierPluginHost.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **SDK-003**: Implement Kiirohana (Cordova Hybrid) host adapter
  - **Objective**: Enable plugin hosting on the Apache Cordova mobile client.
  - **Actions**:
    1. Integrate plugin bridge with Cordova native storage and network bypass.
    2. Ensure sandboxed WebView configuration respects Android file-access restrictions.
  - **Acceptance Criteria**: Demo plugins load on Android emulator via Cordova without file access security violations.
  - **Dependencies**: SDK-002.
  - **Relevant Files**: [`plugins/packages/adapters/src/KiirohanaPluginHost.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/adapters/src/KiirohanaPluginHost.ts).
  - **Priority**: `P2`
  - **Status**: `DONE`

- [x] **SDK-004**: Implement Matcha (React Native / Expo) host adapter
  - **Objective**: Enable plugin hosting on the React Native mobile client.
  - **Actions**:
    1. Implement container using `react-native-webview`.
    2. Map React Native native secure store to broker credential provider.
  - **Acceptance Criteria**: Demo plugin renders and executes inside Matcha RN application.
  - **Dependencies**: SDK-002.
  - **Relevant Files**: [`plugins/packages/adapters/src/MatchaPluginHost.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/adapters/src/MatchaPluginHost.ts).
  - **Priority**: `P2`
  - **Status**: `DONE`

---

## Phase 7 — Registry and Plugin Store

- [x] **REG-001**: Design Plugin Registry API specification (OpenAPI 3.1)
  - **Objective**: Define REST endpoints for plugin publishing, catalog search, metadata retrieval, and package downloads.
  - **Actions**:
    1. Draft OpenAPI 3.1 specification for registry service (`GET /v1/plugins`, `GET /v1/plugins/{id}`, `POST /v1/plugins/publish`).
    2. Define version filtering by client engine compatibility query params.
  - **Acceptance Criteria**: OpenAPI spec validates; covers all store browsing, pagination, and download flows.
  - **Dependencies**: CONT-001.
  - **Relevant Files**: [`plugins/schemas/v1/registry-api.openapi.yaml`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/schemas/v1/registry-api.openapi.yaml).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **REG-002**: Implement Ed25519 Package Signing and Verification Tooling
  - **Objective**: Provide CLI tools to sign plugin packages with publisher private keys and verify signatures during client installation.
  - **Actions**:
    1. Implement `miyuna-plugin sign <package.mpk> --key <priv.key>`.
    2. Implement `miyuna-plugin verify <package.mpk> --public-key <pub.key>`.
  - **Acceptance Criteria**: Tampered files inside package fail verification with signature mismatch errors.
  - **Dependencies**: RUN-001.
  - **Relevant Files**: [`plugins/packages/cli/src/commands/sign.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/cli/src/commands/sign.ts), [`plugins/packages/cli/src/commands/verify.ts`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/cli/src/commands/verify.ts).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **REG-003**: Build standalone reference Registry Service
  - **Objective**: Implement a lightweight, standalone registry backend decoupled from core microservices.
  - **Actions**:
    1. Implement Node.js / Fastify registry service adhering to REG-001 OpenAPI spec.
    2. Store `.mpk` artifacts in local or S3-compatible storage.
  - **Acceptance Criteria**: Client plugin manager can search, fetch metadata, and download packages from registry.
  - **Dependencies**: REG-001, REG-002.
  - **Relevant Files**: [`plugins/services/registry/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/services/registry/).
  - **Priority**: `P2`
  - **Status**: `DONE`

---

## Phase 8 — Conformance, Security, and Reliability

- [x] **TEST-001**: Automated Conformance Test Suite for Host Clients
  - **Objective**: Create automated test harness to verify that any official client correctly implements the plugin host contract.
  - **Actions**:
    1. Develop headless test harness running standardized test plugins.
    2. Verify lifecycle transitions, broker error codes, quota enforcement, and event propagation.
  - **Acceptance Criteria**: Conformance suite produces a standardized compliance report across Web, Cordova, and React Native.
  - **Dependencies**: SDK-002, SDK-003, SDK-004.
  - **Relevant Files**: [`plugins/packages/conformance-tests/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/packages/conformance-tests/).
  - **Priority**: `P1`
  - **Status**: `DONE`

- [x] **TEST-002**: Security Boundary and Penetration Test Suite
  - **Objective**: Subject sandbox and broker to automated attack vectors.
  - **Actions**:
    1. Test DOM escape attempts (`parent.document`, `top.location`).
    2. Test token theft attempts (probing cookies, localStorage, host scope).
    3. Test Zip Slip path traversals and archive decompression bombs.
    4. Test network port scanning and unauthorized local IP probes.
  - **Acceptance Criteria**: 100% of attack payloads are blocked by sandbox CSP or broker permission gates.
  - **Dependencies**: RUN-001, RUN-003, UI-001, CONN-001.
  - **Relevant Files**: [`plugins/tests/security/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/tests/security/).
  - **Priority**: `P0`
  - **Status**: `DONE`

- [x] **TEST-003**: Upgrade, Downgrade, and Failure Recovery Validation
  - **Objective**: Ensure that updating or failing plugins do not destabilize the host application.
  - **Actions**:
    1. Test plugin version upgrade from 1.0.0 to 1.1.0 preserving namespaced storage.
    2. Test rollback when an updated package fails verification.
    3. Test host behavior when a plugin throws uncaught exceptions or triggers an infinite loop.
  - **Acceptance Criteria**: Host UI remains responsive; failing plugin crashes are contained with an error card and disable option.
  - **Dependencies**: RUN-002, UI-002.
  - **Relevant Files**: [`plugins/tests/reliability/`](file:///c:/Users/Ananda/Documents/Coding/Miyuna/plugins/tests/reliability/).
  - **Priority**: `P1`
  - **Status**: `DONE`
