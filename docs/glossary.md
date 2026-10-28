# Universal Plugin Ecosystem — Glossary & Terminology

This glossary defines the formal vocabulary and domain models used across the Universal Plugin Ecosystem architecture, specifications, SDKs, and implementation tasks.

---

## 1. Core Platform vs. Extension System

### Core Platform
The mandatory foundational systems, microservices, and client features that power the community platform. Core platform services include:
- User accounts, identities, authentication, authorization, and profile management (`auth-service`, `user-service`).
- Media catalogs (comics, anime, novels, movies, metadata) (`media-service`).
- Community chat, threads, and group discussions (`group-service`, community microservices).
- Shorts (short-form media) and real-time notifications.
- Gateway routing and platform-level rate-limiting (`api-gateway`).

*Rule:* Core platform capabilities are never optional plugins and cannot be overridden, replaced, or disabled by plugins.

### Plugin / Extension
An optional, modular software package that extends the platform's capabilities without modifying core microservices or altering mandatory client behavior. Plugins adhere to strict platform-neutral contracts.

### Host Application (Client)
An official or authorized platform client application (e.g., Glacier [Web], Kiirohana [Cordova/Hybrid], Matcha [React Native], Hanatsuki [Web/Desktop], Cactus [Native/Future]) that hosts the plugin runtime, renders UI contributions, and enforces security boundaries.

---

## 2. Fundamental Tripartite Separation

To prevent ambiguity, security vulnerabilities, and architectural coupling, three concepts are strictly decoupled:

```
+--------------------------------------------------------------------------------+
|                                    PLUGIN                                      |
+--------------------------+------------------------------+----------------------+
| 1. Artifact Type         | 2. Contribution Type         | 3. Capability        |
| (What is packaged/run)   | (Where/how it integrates)    | (What it may access) |
+--------------------------+------------------------------+----------------------+
| - Web UI Bundle          | - Route / Page               | - Storage:namespaced |
| - WebAssembly Module     | - Widget / Panel             | - Net:domain-scoped  |
| - Service Connector JSON | - Context Menu / Action      | - Broker:naviah-sync |
| - Native Adapter         | - Event Listener             | - UI:navigation-read |
| - Declarative Workflow   | - Capability Provider        | - Clipboard:read     |
+--------------------------+------------------------------+----------------------+
```

### Artifact Type
The physical nature and packaging format of the executable or declarative asset:
- **`web-bundle`**: Static HTML, CSS, JavaScript, and asset bundles hosted in an isolated WebView or iframe.
- **`wasm-module`**: Sandboxed WebAssembly binary containing deterministic, non-UI computational logic.
- **`service-connector`**: Declarative schema definitions (REST/GraphQL/WebSocket endpoints, auth schemes) and mapping rules for external services.
- **`native-adapter`**: Platform-specific compiled binary or host-native module (subject to operating system and app-store restrictions).
- **`declarative-workflow`**: Static JSON/YAML state-machine or pipeline executing within the host's workflow interpreter.

### Contribution Type
The UI, system, or logical integration slot where the plugin attaches to the host:
- **`route` / `page`**: A distinct, namespaced navigable screen or view.
- **`widget`**: An embeddable UI block or dashboard component.
- **`menu-entry` / `action`**: An item contributed to an existing host menu, toolbar, or context menu.
- **`event-listener`**: A handler registered to receive filtered, approved host or bus events.
- **`capability-provider`**: A plugin providing a concrete service (e.g., sync provider, protocol adapter) accessible by other approved plugins via the Capability Broker.

### Capability
A specific, granular permission or host privilege granted to the plugin:
- Declared in the plugin manifest as a **request**.
- Evaluated and either granted or denied by the Host Application / Capability Broker.
- Examples: `storage.local` (isolated key-value store), `network.fetch` (domain-restricted outbound requests), `device.sync` (request sync trigger), `media.cache.read` (read cached community media).

---

## 3. Subsystem Terminology

### Capability Broker
The central gateway and mediator within the Host Application. All requests from plugins to host resources, native adapters, platform APIs, or other plugins must pass through the broker. The broker validates schemas, verifies granted permissions, handles timeouts, enforces rate limits, and audits operations. Direct access to host internals is strictly disallowed.

### Plugin Manifest (`plugin.json`)
A structured, cryptographically verifiable descriptor file containing metadata, identity, required permissions, declared contributions, compatible client engines, and entry point artifacts.

### Plugin Package (`.mpk` / Miyuna Package)
A standard ZIP archive containing the manifest, signed digest, assets, and executable artifacts, packaged according to ecosystem conventions.

### Plugin Registry & Store
The centralized or federated distribution service responsible for indexing plugin metadata, validating publisher signatures, verifying security attestations, tracking version compatibility matrices, and distributing plugin packages.

### UI Sandbox
The isolation boundary that isolates plugin visual components from the host client's DOM, state, and authentication tokens (e.g., `<iframe sandbox="...">`, isolated WebViews, out-of-process renders).

### Event Bus
An isolated, asynchronous publish-subscribe message router within the host client. Events are namespaced, type-checked, and access-controlled; plugins only receive events for which they have declared explicit subscriptions and been granted authorization.

### External Service Connector
A plugin component specialized in interfacing with external, third-party, or self-hosted servers (such as Jellyfin, Plex, custom media servers, or tracking platforms). Handles protocol negotiation, credential persistence via host secure storage, and CORS/network bridging.

### Naviah Sync
An optional device synchronization capability that coordinates user data, offline media, or local configurations across user devices. It is an optional native capability exposed via the Capability Broker, not a mandatory core microservice.
