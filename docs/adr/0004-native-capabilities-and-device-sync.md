# ADR-0004: Native Capabilities and Device Synchronization (Naviah Sync)

## Status
Accepted

## Context
Use cases for the plugin ecosystem include optional device capabilities such as **Naviah Sync** (device-to-device or local synchronization) and hardware access (e.g., Bluetooth, camera, local file system).

However, operating system environments and official app stores (Google Play Store, Apple App Store) impose strict rules:
1. Dynamic loading of third-party native code (e.g., `.so` or `.dylib` downloaded at runtime) is strictly prohibited by Google Play and Apple App Store policies (violating code-execution policies).
2. Different clients (Glacier [Web], Kiirohana [Cordova], Matcha [React Native], future Flutter or native clients) have vastly different native integration mechanisms.
3. Native capabilities like Naviah Sync must not be baked into the mandatory core microservices (`Partisier-Rewritten`), as they are optional device features.

We need an architectural strategy for native extensions and Naviah Sync that maintains store compliance, cross-client viability, and security.

## Considered Options
1. **Option 1: Dynamic Native Code Loading (Runtime Dynamic Libraries)**
   - Download `.so` / `.dll` / `.dylib` inside plugin packages and dynamically load via dlopen / JNI / FFI.
   - *Risk:* Immediate violation of Apple App Store and Google Play developer distribution policies; high crash and security vulnerability risks.
2. **Option 2: Host-Provided Native Adapters with Broker-Mediated Contracts**
   - The official client binaries ship pre-compiled, audited native capabilities (or client plugins, e.g., Cordova plugins, React Native TurboModules).
   - In environments where a native capability is unavailable (e.g., pure web browser without WebRTC/Local Network access), the client reports the capability as unavailable or provides an emulated/mock provider.
   - Plugins declare dependencies on named capabilities (e.g., `device.naviah-sync`), and access them solely via typed RPC through the Capability Broker.
3. **Option 3: External Companion Daemon / Sidecar**
   - Require users to run a local native daemon (e.g., in Rust/Go) listening on localhost, which plugins connect to via WebSockets.

## Decision Drivers & Evaluation Criteria
- **Store Compliance**: 100% compliance with Google Play Store Developer Program Policy and Apple App Store Review Guidelines.
- **Security & Stability**: No arbitrary native memory execution; native code is compiled and vetted as part of the client build.
- **Graceful Degradation**: Clear capability discovery API (`broker.getAvailableCapabilities()`) so plugins adapt when running on a platform lacking a specific native provider.
- **Decoupled Core**: Core microservices remain untouched; sync protocol logic resides in client native modules or external connectors.

## Decision
Adopt **Option 2: Host-Provided Native Adapters with Broker-Mediated Contracts**, with a dedicated **Mock Provider Framework** for headless testing and unsupported platforms.

### Naviah Sync Architecture:
1. **Capability Definition**:
   - Capability ID: `device.naviah-sync`
   - Operations:
     - `getSyncStatus()`: Returns current sync state (idle, syncing, error, lastSyncedAt).
     - `discoverPeers()`: Discovers nearby or paired devices on the local network.
     - `startSync(options)`: Initiates a synchronization session for selected scopes.
     - `cancelSync(sessionId)`: Cancels an ongoing session.
2. **Native Provider Implementation**:
   - In **Kiirohana** (Cordova): implemented via a custom Cordova plugin interfacing with Android native networking.
   - In **Matcha** (React Native): implemented via an Expo / RN Native Module.
   - In **Glacier / Hanatsuki** (Web): capability is marked as `UNSUPPORTED`, or optionally backed by a WebRTC data channel provider where supported.
   - In **Testing / Development**: a Mock Naviah Sync Provider simulates discovery, progress events, and transfer failures for test automation.

## Consequences

### Positive
- Strict adherence to mobile app store distribution rules.
- Predictable security posture: host native code is signed and audited during official client releases.
- Plugins can be developed once against the abstract `device.naviah-sync` broker contract and run everywhere the provider is available.

### Negative / Trade-offs
- Adding entirely new native OS hardware interfaces requires releasing an updated host client binary. Third-party developers cannot introduce arbitrary native C/Rust code dynamically at runtime.
