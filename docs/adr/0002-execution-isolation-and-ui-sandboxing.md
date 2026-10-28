# ADR-0002: Execution Isolation and UI Sandboxing Strategy

## Status
Accepted

## Context
Plugins may execute untrusted or third-party code and render UI within the host client application (e.g., mini-games, custom dashboards, external service viewers). 

Crucially:
1. Plugins must not be able to steal user credentials, session cookies, or JWT auth tokens (`auth-service`).
2. Plugins must not be able to modify the host DOM, hijack navigation, or read host application state directly.
3. Official clients span different application technologies:
   - Web browser clients (e.g., Glacier, Hanatsuki)
   - Hybrid mobile clients (e.g., Kiirohana using Apache Cordova)
   - React Native mobile clients (e.g., Matcha using Expo/RN)
   - Native mobile or desktop clients

We need an execution isolation model that works cleanly across these diverse host environments without compromising security.

## Considered Options
1. **Option 1: In-Process Script Execution (eval / dynamic script injection)**
   - Run plugin JavaScript directly in the host's main JavaScript context.
2. **Option 2: Isolated WebView / Sandboxed iframe with Typed PostMessage Bridge**
   - For UI-bearing plugins: render in a restricted iframe (web) or dedicated isolated WebView (mobile/desktop).
   - Use strict sandbox attributes: `sandbox="allow-scripts allow-forms"`, disallowing `allow-same-origin`, `allow-top-navigation`, or `allow-modals`.
   - Communication with the host takes place exclusively through an asynchronous, typed message bridge.
3. **Option 3: WebAssembly (Wasm) Runtime for all execution**
   - Execute all plugin logic in a Wasm sandbox (e.g., Wasmer/WasmEdge or browser Wasm engine).

## Decision Drivers & Evaluation Criteria
- **Security Boundaries**: Host authentication tokens and DOM must be physically unreachable by the plugin script.
- **UI Rendering Capability**: Mini-games and rich UI need HTML5 Canvas, WebGL, CSS, and DOM rendering. WebAssembly cannot render UI directly without host bindings or DOM bridges.
- **Portability Across Clients**:
  - Web: standard `<iframe sandbox="allow-scripts">` provides browser-enforced origin isolation (origin is `null`).
  - Cordova / Hybrid: separate sandboxed WebView instance or sandboxed in-app iframe.
  - React Native: isolated `react-native-webview` running in an unprivileged context.
- **Performance**: High frame rate for mini-games and interactive views.

## Decision
Adopt **Option 2: Isolated WebView / Sandboxed iframe with Typed PostMessage Bridge** for UI contributions, complemented by **Wasm** for pure non-UI deterministic computation.

### Architectural Rules for UI Sandboxing:
1. **Origin Isolation**:
   - In Web clients (Glacier, Hanatsuki), UI plugins run inside an `<iframe sandbox="allow-scripts">` where `window.origin` is opaque (`null`), preventing access to host `localStorage`, cookies, indexedDB, or DOM.
   - In Mobile clients (Kiirohana, Matcha), plugins execute in an isolated WebView instance configured with:
     - JavaScript enabled.
     - File scheme access disabled (`setAllowFileAccess(false)`).
     - Universal access from file URLs disabled.
     - Local storage namespaced exclusively to the plugin's sandbox directory.
2. **Bridge Protocol**:
   - The plugin communicates with the host exclusively via standard `window.postMessage` / `MessageChannel` using the **Universal Capability Broker RPC** protocol (defined in ADR-0003).
   - The host verifies `event.source` or channel credentials on every incoming message.
3. **Content Security Policy (CSP)**:
   - Sandboxed frames enforce a restrictive default CSP:
     ```
     default-src 'self' 'unsafe-inline' blob: data:;
     connect-src 'none'; /* Network access must be brokered or explicitly granted */
     script-src 'self' 'unsafe-eval'; /* 'unsafe-eval' permitted only for game engines if declared */
     frame-src 'none';
     ```

## Consequences

### Positive
- Robust, browser- and OS-enforced security boundary.
- Zero risk of host session token leakage via DOM inspection or direct memory access.
- Supports popular game frameworks (Phaser, Pixi.js, Three.js) and standard modern web tooling.

### Negative / Trade-offs
- Message passing across the sandbox boundary introduces serialization overhead (structured clone).
  - *Mitigation:* Cap payload sizes for RPC calls; transfer large binary data using `ArrayBuffer` / `Transferable` objects.
