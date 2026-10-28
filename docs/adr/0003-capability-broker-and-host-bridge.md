# ADR-0003: Capability Broker and Host-Plugin Bridge Architecture

## Status
Accepted

## Context
Plugins require access to approved host capabilities (namespaced storage, clipboard, external network requests, navigation notifications, device sync operations) and may communicate with other plugins. 

Direct access to host global APIs (e.g., `window.fetch`, `localStorage`, native Android APIs) is prevented by sandboxing (ADR-0002). Furthermore, plugins must not bypass authorization checks or impersonate other plugins.

We must define a unified, technology-agnostic IPC / RPC protocol for plugin-host communication that operates cleanly over `postMessage`, `MessageChannel`, WebSockets, or native bridge interfaces.

## Considered Options
1. **Option 1: JSON-RPC 2.0 over Typed Message Channels**
   - Standard request/response and notification semantics with numeric/string correlation IDs.
   - Standardized error codes and error objects.
2. **Option 2: gRPC / Protocol Buffers over Byte Streams**
   - Binary serialization with proto definitions.
3. **Option 3: Ad-hoc Event Emitter with Arbitrary Payloads**
   - Custom event names and unstructured object payloads.

## Decision Drivers & Evaluation Criteria
- **Platform Neutrality**: Works seamlessly in JavaScript (Web/Cordova/React Native), Dart (Flutter), Kotlin/Java (Android), Swift/Obj-C (iOS).
- **Inspectability**: JSON payloads can be logged and audited without compiling protobuf schemas into every micro-client.
- **Specification Rigor**: JSON-RPC 2.0 provides clear semantics for request/response pairing, batching, error codes, and unidirectional notifications.
- **Permission Interception**: Every request method maps directly to a declared and granted capability.

## Decision
Adopt **Option 1: JSON-RPC 2.0 over Typed Message Channels** mediated by the **Capability Broker**.

### Capability Broker Responsibilities:
1. **Message Routing & Validation**:
   - Inspects `method` on incoming requests (e.g., `capability.invoke`).
   - Verifies the calling plugin ID against the authenticated communication channel.
2. **Permission Check**:
   - Compares the requested capability and target resource against the plugin's granted permissions.
   - Returns standard error `-32001 (Permission Denied)` if unauthorized.
3. **Execution & Rate Limiting**:
   - Dispatches execution to the registered Host Provider (e.g., Storage Provider, Network Provider, Sync Provider).
   - Enforces timeouts (default 10s) and per-plugin invocation quotas.
4. **Inter-Plugin Events**:
   - Mediates the Host Event Bus. Plugins emit events via `event.publish`; subscribers receive events via `event.onNotify` only if authorized.

### Protocol Message Examples:

#### Request (Plugin -> Host via Broker):
```json
{
  "jsonrpc": "2.0",
  "id": "req-1049",
  "method": "capability.invoke",
  "params": {
    "capability": "storage.local",
    "action": "setItem",
    "args": {
      "key": "userTheme",
      "value": "dark"
    }
  }
}
```

#### Response (Host -> Plugin):
```json
{
  "jsonrpc": "2.0",
  "id": "req-1049",
  "result": {
    "success": true,
    "bytesUsed": 48,
    "quotaRemaining": 10485232
  }
}
```

#### Error Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-1049",
  "error": {
    "code": -32001,
    "message": "Permission Denied: Plugin 'org.miyunadev.demo' has not been granted 'storage.local'",
    "data": {
      "requiredCapability": "storage.local"
    }
  }
}
```

## Consequences

### Positive
- Strict isolation: plugins cannot call host internals directly.
- Full auditability: every interaction is routed through the broker and can be logged or throttled.
- Universal across client technologies: JSON-RPC 2.0 adapters are straightforward to implement in TypeScript, Kotlin, Dart, or Swift.

### Negative / Trade-offs
- Slight overhead compared to direct in-memory function calls. This is an intentional design trade-off for security and cross-stack isolation.
