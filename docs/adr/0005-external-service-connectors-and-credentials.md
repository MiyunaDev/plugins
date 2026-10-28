# ADR-0005: External Service Connectors, Networking, and Secure Credential Storage

## Status
Accepted

## Context
A major category of plugins is **External Service Integrations** (e.g., self-hosted media servers such as Jellyfin, Plex, custom media repositories, and external tracking services like AniList/MyAnimeList).

These services present architectural challenges:
1. **Network Barriers**: Web clients face CORS (Cross-Origin Resource Sharing) and Mixed Content restrictions when connecting to local IP addresses (e.g., `http://192.168.1.100:8096`).
2. **Credential Security**: API keys, server tokens, and passwords must never be stored in plain text or exposed to other plugins.
3. **Availability & Resilience**: Self-hosted servers can go offline, change IP addresses, or return unexpected payload schemas.

## Considered Options
1. **Option 1: Direct Fetch from Plugin Sandbox**
   - Plugin performs `fetch()` directly from within its sandboxed context.
   - *Limitation:* Fails completely on Web clients due to browser CORS policies and Mixed-Content blocks when the host is served over HTTPS and the local media server is plain HTTP.
2. **Option 2: Host Broker-Proxied Network Requests with Secure Keyring**
   - Plugin requests network access via the Capability Broker (`network.fetch` capability).
   - In native/hybrid clients (Kiirohana, Matcha), the host client executes the HTTP request natively, bypassing browser CORS restrictions.
   - Host manages sensitive credentials (tokens, passwords) in OS-native secure storage (Android Keystore / EncryptedSharedPreferences, iOS Keychain, or browser IndexedDB with subtle crypto wrapping). The plugin only references credentials by a scoped `credentialId`.
3. **Option 3: Centralized Platform Cloud Proxy Microservice**
   - Route all external service traffic through the central Miyuna microservice backend (`Partisier-Rewritten`).
   - *Issue:* Violates architectural constraint 5.I: core microservices should not be burdened with private local media traffic, and routing local LAN traffic through a remote cloud server is unacceptable for bandwidth and privacy.

## Decision
Adopt **Option 2: Host Broker-Proxied Network Requests with Secure Keyring**.

### Architecture:
1. **Declarative Host Proxy**:
   - Plugins declare their target service patterns in `plugin.json` (e.g., `network.fetch` with allowed hosts or user-configured hosts).
   - The plugin UI invokes `broker.invoke('network.fetch', { url, method, headers, credentialId })`.
   - The host injects the authenticated header (e.g., `X-Emby-Token: <token>`) securely on the host side, preventing the plugin script from exposing the raw token in log streams.
2. **Local Credential Storage Contract**:
   - `auth.storeCredential(serviceId, token)`
   - `auth.getCredentialStatus(serviceId)` -> returns `{ hasToken: true, expiresAt }` without exposing the secret.
   - `auth.clearCredential(serviceId)`
3. **CORS & Mixed-Content Resolution**:
   - Web clients (Glacier): Web users with local HTTP Jellyfin instances can either configure a local HTTPS reverse proxy or use the native/desktop/hybrid clients (Kiirohana, Matcha) where native HTTP networking is not subject to browser origin policy.

## Consequences

### Positive
- Robust security: raw third-party service credentials are kept in client secure storage, isolated per plugin.
- Zero server load on central microservices: all media and metadata streaming is client-to-service direct.
- Seamless compatibility with self-hosted media platforms.

### Negative / Trade-offs
- Web browser client limitations for unencrypted local IP servers must be clearly documented for end users.
