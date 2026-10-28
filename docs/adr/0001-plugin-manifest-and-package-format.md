# ADR-0001: Plugin Package Format and Manifest Schema

## Status
Accepted

## Context
The Universal Plugin Ecosystem requires a standardized, technology-neutral packaging format that allows developers to package web bundles, WebAssembly modules, declarative connectors, and static assets. The package must support cryptographic integrity verification, publisher signing, dependency declarations, and deterministic unpacking across diverse client operating systems (Web, Android, iOS, Desktop).

We must decide whether to create a custom binary archive format, adopt an existing standard container, or use a standard compressed archive.

## Considered Options
1. **Option 1: Standard ZIP Archive with Convention-Based Structure (`.mpk` / Miyuna Package)**
   - Standard zip format (deflate compression) with a mandatory `.mpk` extension.
   - Contains a root-level `plugin.json` (manifest), `checksums.json`, and an optional `signature.sig`.
2. **Option 2: OCI / Tarball Container Image**
   - Standard tar.gz or OCI image layers.
3. **Option 3: Custom Binary Archive Format**
   - Bespoke binary container with custom headers and block allocations.

## Decision Drivers & Evaluation Criteria
- **Cross-platform runtime compatibility**: Native zip decompression libraries exist in Web (via JS/Wasm), Android (Java/Kotlin `java.util.zip`), iOS (libcompression), React Native, and Node.js without requiring heavy third-party runtimes.
- **Inspectability & Tooling**: Developers and security auditors should be able to inspect package contents using off-the-shelf tools (`unzip`, 7-Zip, standard archivers).
- **Security & Integrity**: Must support deterministic content hashing (SHA-256) per file, tamper detection, and public-key digital signatures (Ed25519).
- **Simplicity**: Avoid unnecessary binary complexity or container engine requirements.

## Decision
Adopt **Option 1: Standard ZIP Archive with convention-based layout (`.mpk`)** and a strictly validated JSON manifest (`plugin.json`) conforming to JSON Schema Draft-07 / 2020-12.

### Package Layout Specification:
```
package.mpk (Standard ZIP)
├── plugin.json              # Plugin Manifest (Required)
├── checksums.json           # SHA-256 digests of all package files (Required)
├── signature.sig            # Ed25519 publisher signature of checksums.json (Optional in dev, required in production)
├── icon.png                 # Plugin icon (256x256 PNG)
├── dist/                    # Compiled artifacts (Web bundle, Wasm, etc.)
│   ├── index.html
│   └── main.js
└── assets/                  # Static assets (images, localized strings)
```

### Manifest Schema Design (`plugin.json`):
```json
{
  "$schema": "https://specs.miyunadev.org/schemas/v1/plugin.json",
  "id": "org.miyunadev.plugins.jellyfin-connector",
  "name": "Jellyfin Media Connector",
  "version": "1.0.0",
  "author": {
    "name": "Community Contributor",
    "email": "dev@example.org"
  },
  "engines": {
    "miyuna": ">=1.0.0 <2.0.0",
    "client": {
      "web": true,
      "android": true,
      "ios": true
    }
  },
  "artifact": {
    "type": "web-bundle",
    "entry": "dist/index.html"
  },
  "contributions": [
    {
      "type": "route",
      "id": "jellyfin-dashboard",
      "title": "Jellyfin Library",
      "path": "/ext/jellyfin",
      "icon": "assets/icon.png"
    }
  ],
  "capabilities": [
    {
      "name": "storage.local",
      "quota": "10MB"
    },
    {
      "name": "network.fetch",
      "domains": ["*"]
    }
  ]
}
```

## Consequences

### Positive
- Universal decompression support across all clients (Vite/React, Cordova, React Native, Kotlin, Flutter).
- Fast validation without needing specialized binary parsing libraries.
- Strong integrity guarantees via cryptographic checksum verification prior to extraction.

### Negative / Trade-offs
- Zip slip vulnerability risk if file paths are not sanitized during extraction (e.g., `../../etc/passwd`).
  - *Mitigation:* The local plugin manager must strictly reject archives containing directory traversal characters (`..`) or absolute paths.
