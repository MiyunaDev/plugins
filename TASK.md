# PHASE 1 — Prepare the Universal Plugin Ecosystem

## 1. Role and Objective

Act as a senior software architect and technical planning engineer.

Your task is to prepare the initial project documentation and implementation roadmap for a **Universal Plugin Ecosystem** intended for a large-scale, multi-client community platform.

For this phase, prioritize documentation, architecture analysis, TODO planning, and repository preparation. Do not implement the entire system.

**Primary deliverables:**
1. `README.md` — project overview, objectives, architecture, scope, and development guidance.
2. `TODO.md` — detailed, actionable, prioritized implementation roadmap.
3. Additional architecture documents when they materially improve clarity and maintainability.

**Target directory:** `plugins`

All documentation and newly created project files must be placed inside the specified target directory unless the user explicitly authorizes another location.

## 2. Project Context

The ecosystem belongs to a large-scale community application platform with multiple official client applications.

The platform provides core features through multiple microservices, including:

- User accounts, profiles, authentication, and authorization.
- Community chat.
- Media catalogs for comics, anime, novels, movies, and related content.
- Threads and community discussions.
- Short-form content, referred to as Shorts.
- Notifications and other public platform features.
- Other features exposed by the platform's public microservices.

These core features are mandatory. They are not optional plugins and must not be moved into the extension system.

Multiple official clients may use different technology stacks and visual designs, including:

- Apache Cordova.
- Capacitor.
- Native Android using Kotlin or Java.
- Flutter.
- React Native.
- Web applications.
- Other client technologies that may be evaluated later.

Official clients may have different names, themes, layouts, navigation patterns, and implementation details. However, they must remain functionally equivalent regarding the platform's core features and supported extension contracts.

The objective is to support experimentation with multiple technologies without intentionally disadvantaging one official client.

The architecture must not require all clients to use the same programming language, UI framework, or native implementation.

## 3. Plugin Ecosystem Objectives

The plugin system extends the platform with optional functionality that is not part of the mandatory core platform.

Expected plugin use cases include:

### A. Embedded UI and Mini-games
- Interactive mini-games embedded within an official client.
- Plugin-provided pages, widgets, menus, commands, and other approved UI contributions.
- HTML/CSS/JavaScript-based experiences where appropriate.
- Portable WebAssembly-based logic where appropriate.
- A controlled interface for interacting with the host application.

### B. External Service Integrations
- Self-hosted media servers such as Jellyfin or Plex.
- External tracking services.
- Self-hosted media storage.
- Other user-configured services exposed through REST APIs, WebSockets, or suitable protocols.

### C. Optional Device Capabilities
- Naviah Sync, an optional capability outside the core platform.
- Device synchronization and other supported native integrations.
- Additional capabilities provided by platform-specific adapters.

### D. Integration and Workflow Plugins
- Plugins that combine multiple approved capabilities.
- Plugins that react to permitted platform events.
- Plugins that expose new functionality without replacing mandatory core features.

The system must support installation, activation, deactivation, uninstallation, and updating of compatible plugins independently of core client releases, subject to platform security and distribution constraints.

Do not assume that every plugin can execute on every operating system. Define compatibility explicitly.

## 4. Architectural Principles

Use the following principles as mandatory planning constraints.

### 4.1 Separate Core and Extensions

The core platform owns mandatory features and their business rules.

Plugins may extend the platform but must not replace, disable, or redefine core functionality by default.

Core API access must follow the platform's official authentication, authorization, versioning, and rate-limiting policies.

### 4.2 Platform-Neutral Contracts

Define technology-independent contracts for:

- Plugin manifests.
- Plugin lifecycle.
- Capability declarations.
- Permission requests and grants.
- UI contributions.
- Inter-plugin integration.
- Event subscriptions and delivery.
- Errors and timeouts.
- Version compatibility.
- Installation and update metadata.

Client-specific SDKs and adapters must implement these contracts.

Do not equate a universal contract with universally executable code. Native capabilities may require different implementations on Android, iOS, desktop, and web.

### 4.3 Separate Artifact Type, Contribution, and Capability

These are three independent concepts.

**Artifact type** describes what is installed or executed, for example:
- Web UI bundle.
- WebAssembly module.
- External service connector.
- Native adapter.
- Declarative UI or workflow definition.

**Contribution type** describes what a plugin adds, for example:
- Page or route.
- Menu entry.
- Widget.
- Command.
- Background task.
- Event handler.
- Capability provider.

**Capability** describes what the plugin is permitted to do, for example:
- Access its own namespaced storage.
- Register a route.
- Subscribe to approved events.
- Access an approved network destination.
- Read clipboard data, if supported and explicitly authorized.
- Start an approved synchronization operation.

Do not combine these three concepts into a single plugin category or trust level.

### 4.4 Explicit Permission Enforcement

Manifest declarations are requests, not grants.

The host application or trusted runtime must enforce granted permissions.

Plan for:
- Least-privilege defaults.
- Explicit permission grants.
- Permission revocation.
- Per-plugin storage isolation and quotas.
- Network destination restrictions where appropriate.
- Resource limits.
- Native API access controls.
- User-visible plugin status and permission information.

Never assume that code executing inside a plugin will enforce its own permissions correctly.

### 4.5 Capability Broker

Plan a central capability broker through which plugins access approved host capabilities and native providers.

A plugin must not directly access arbitrary host internals, invoke arbitrary native methods, or inherit another plugin's permissions.

The broker should define:
- Capability identifiers.
- Provider registration and discovery.
- Typed operation inputs and outputs.
- Schema and version validation.
- Permission checks.
- Dependency checks.
- Timeouts and cancellation.
- Error handling.
- Event delivery rules.
- Provider availability and failure states.

For example, Naviah Sync could expose operations such as `getCapabilities`, `startSync`, `cancelSync`, and `getStatus`. These names are illustrative; finalize their contracts during architecture planning.

### 4.6 Cross-Client Compatibility

Each official client must implement the same mandatory core behavior and the shared extension contracts it claims to support.

Plan a conformance test suite to verify:
- Core feature parity.
- Plugin lifecycle behavior.
- Permission enforcement.
- Capability contract compatibility.
- Event and error semantics.
- Plugin installation and update behavior.

Document unsupported platform capabilities explicitly instead of silently degrading behavior.

### 4.7 Security and Isolation

Evaluate suitable isolation mechanisms for each artifact type.

Consider:
- Sandboxed WebViews or equivalent isolated web contexts.
- WebAssembly runtimes where appropriate.
- Native adapters with narrowly defined interfaces.
- Credential isolation.
- Secure transport.
- Package integrity and signatures.
- Dependency verification.
- Resource exhaustion.
- Malicious plugin packages.
- Supply-chain risks.
- Plugin update rollback and failure recovery.

Do not assume WebAssembly automatically provides UI rendering, native access, or complete application-level security.

Do not assume dynamic native code installation is allowed on every platform. Investigate operating-system and application-store restrictions before proposing implementation mechanisms.

## 5. Required Architecture Areas to Investigate

Analyze and document the following subsystems.

### A. Plugin Registry and Store
- Plugin discovery and search.
- Publisher identity.
- Package metadata.
- Version history.
- Compatibility declarations.
- Dependencies.
- Package downloads.
- Integrity verification.
- Publication and update workflow.
- Deprecation and removal policy.

### B. Plugin Package Format
Evaluate whether to use a standard archive or a custom package format.

Define the conceptual package contents, such as:
- Manifest.
- Executable artifacts.
- UI assets.
- Capability and permission declarations.
- Interface schemas.
- Dependency metadata.
- Integrity and signature metadata.

Do not invent a custom binary format without a documented requirement.

### C. Local Plugin Manager
- Installation.
- Validation.
- Activation and deactivation.
- Uninstallation.
- Updating.
- Dependency resolution.
- Compatibility checking.
- Permission management.
- Failure recovery.
- Plugin state persistence.

### D. Plugin Runtime
- Artifact loading.
- Lifecycle management.
- Execution isolation.
- UI hosting.
- Capability access.
- Event handling.
- Resource limits.
- Logging and diagnostics.

### E. UI Integration
Define how plugins can request approved contributions without directly modifying core application navigation or internal UI state.

Consider:
- Namespaced routes.
- Embedded pages.
- Widgets.
- Menu entries.
- Commands.
- Navigation lifecycle.
- UI sandboxing.
- Host-to-plugin communication.

### F. Event Bus and Inter-Plugin Communication
Define event naming, payload schemas, delivery guarantees, access controls, and failure handling.

Plugins must not automatically gain access to all platform events or other plugins' private data.

### G. External Service Connectors
Document the security and compatibility requirements for REST APIs, WebSockets, self-hosted services, and other protocols.

Consider CORS, TLS, credential storage, local-network access restrictions, timeouts, rate limits, API changes, and server availability.

### H. Client Adapters and SDKs
Determine the minimum adapter responsibilities for:
- Web.
- Cordova/Capacitor.
- Flutter.
- React Native.
- Native Android.
- Future client implementations.

Avoid committing to a specific SDK implementation before identifying the shared contracts.

### I. Backend and Storage
Evaluate what belongs in the plugin registry backend versus the local runtime and existing platform microservices.

Possible responsibilities include:
- Plugin metadata and publication.
- Package storage.
- Publisher verification.
- Version compatibility.
- Distribution.
- Audit records.

Do not automatically centralize all plugin execution or external service traffic in the backend.

Keep the existing core platform's business logic separate from the plugin registry.

## 6. Required Repository Inspection

Before writing documentation:

1. Inspect the target directory and its immediate repository structure.
2. Determine whether the directory already contains source code, documentation, configuration, or an existing implementation.
3. Read relevant existing README files, package manifests, architecture documents, and TODO files.
4. Identify existing conventions and reuse them when appropriate.
5. Distinguish verified repository facts from assumptions and proposed architecture.
6. Avoid overwriting or deleting existing work.

If the target directory is empty, prepare a documentation-first project structure.

If it already contains a project, adapt the documentation to the actual repository rather than creating an unrelated architecture.

If the target directory does not exist, confirm that the provided path is intended before creating directories outside an existing repository.

Do not scan unrelated directories, expose secrets, or copy credentials into documentation.

## 7. README.md Requirements

Create or update `README.md` as the primary project entry point.

It must be concise enough to navigate but detailed enough to explain the system.

Include the following sections:

1. Project title and status.
2. Project purpose.
3. Problem statement.
4. Scope and non-goals.
5. Core platform versus optional plugins.
6. Supported client technologies.
7. Architectural principles.
8. High-level architecture.
9. Main subsystems and their responsibilities.
10. Plugin categories and examples.
11. Cross-client compatibility strategy.
12. Security and permission model.
13. Repository structure.
14. Development phases.
15. Links to supporting architecture documents.
16. Links to `TODO.md`.
17. Known unknowns and unresolved decisions.

Use a Mermaid diagram if it improves architectural clarity.

The README must not claim that a feature has been implemented merely because it is planned.

Label planned, proposed, implemented, and verified functionality accurately.

Do not fill the README with generic marketing language.

## 8. TODO.md Requirements

Create or update `TODO.md` as the main actionable implementation roadmap.

The TODO must be detailed enough for a future coding agent to execute individual tasks without guessing the intended outcome.

Organize tasks into phases.

### Phase 0 — Repository and Architecture Preparation
- Repository inspection.
- Requirements documentation.
- Architecture decisions.
- Glossary.
- Initial README and TODO.
- Identification of unresolved decisions.

### Phase 1 — Shared Contracts
- Plugin manifest schema.
- Plugin identity and versioning.
- Compatibility declarations.
- Capability naming conventions.
- Permission model.
- Lifecycle contract.
- Error model.
- Event contract.
- UI contribution contract.
- Version negotiation.

### Phase 2 — Minimal Plugin Runtime
- Package validation.
- Local installation and removal.
- Lifecycle management.
- Permission enforcement.
- Logging and diagnostics.
- Basic isolation.
- Resource limits.
- Runtime failure handling.

### Phase 3 — Minimal UI Extension
- Embedded plugin page.
- Namespaced routes.
- Approved menu or widget contribution.
- Host-plugin communication.
- UI isolation.
- A simple demonstration plugin.

### Phase 4 — External Service Connector
- Connector manifest.
- Endpoint and credential handling.
- Request and response validation.
- Timeouts and rate limits.
- Self-hosted service compatibility.
- Mock service tests.
- A demonstration connector.

### Phase 5 — Capability Broker and Native Providers
- Provider registration.
- Capability discovery.
- Typed operations.
- Permission checks.
- Cancellation and status events.
- Native adapter interface.
- Naviah Sync demonstration, using a mock provider before any real device integration.

### Phase 6 — Client SDKs and Adapters
- Define a common SDK contract.
- Choose an initial reference client.
- Implement the first adapter.
- Document adaptation requirements for other client technologies.
- Add cross-client contract tests.

Do not attempt to implement every client simultaneously during the initial phase.

### Phase 7 — Registry and Plugin Store
- Plugin metadata.
- Publisher and package verification.
- Package distribution.
- Version management.
- Compatibility filtering.
- Dependency resolution.
- Publication and update workflow.

### Phase 8 — Conformance, Security, and Reliability
- Automated compatibility tests.
- Permission boundary tests.
- Malicious input tests.
- Package integrity verification.
- Resource exhaustion tests.
- Failure recovery.
- Upgrade and rollback tests.
- Documentation and release checklist.

Adjust these phases based on repository findings, but document any significant reordering.

### Task Format

Each actionable task should contain:

- [ ] A unique identifier, such as `ARCH-001`.
- A concise task title.
- Objective.
- Specific implementation or research actions.
- Acceptance criteria.
- Dependencies, if any.
- Relevant files or components, when known.
- Priority: `P0`, `P1`, `P2`, or `P3`.
- Status: `TODO`, `IN_PROGRESS`, `BLOCKED`, or `DONE`.

Use the following priority definitions:

- `P0`: Required to establish a safe and coherent foundation.
- `P1`: Required for the minimum usable system.
- `P2`: Important follow-up functionality.
- `P3`: Optional improvements or future experiments.

Avoid vague tasks such as "build plugin system" or "improve security."

Break them into small, verifiable deliverables.

Do not mark tasks as complete unless the relevant work has actually been performed and verified.

Record blockers and external dependencies explicitly.

## 9. Architecture Decision Records

Create an `docs/adr/` directory only if it is useful for the repository.

Document important decisions that require deliberate evaluation, including:

- Portable execution format.
- Plugin package format.
- UI sandbox strategy.
- Capability contract format.
- Native extension strategy.
- Permission enforcement.
- Plugin registry architecture.
- Client compatibility guarantees.
- Credential storage and external service access.

For each unresolved decision, provide:
- Context.
- Available options.
- Evaluation criteria.
- Trade-offs.
- Security implications.
- Recommended direction, if evidence supports one.
- Status: proposed, accepted, rejected, or deferred.

Do not present an unverified recommendation as a final decision.

## 10. Research and Technical Validation

When research is necessary and external sources are available, prioritize official documentation and platform policies.

Verify important assumptions regarding:
- WebAssembly and relevant runtime support.
- WebView and browser isolation.
- Native extension loading restrictions.
- Android and application-store distribution policies.
- Credential storage.
- Cross-platform networking limitations.
- Relevant schema and interface standards.

Cite sources in the relevant architecture documents.

Do not spend excessive time researching every possible framework. Focus on decisions that could force major architectural changes later.

If an assumption cannot be verified, record it as an open question.

## 11. Implementation Constraints for This Phase

This phase is documentation-first.

You MUST:
- Prioritize `README.md` and `TODO.md`.
- Inspect the actual repository before making claims.
- Keep the architecture modular and technology-neutral.
- Produce concrete, testable tasks.
- Record unresolved design questions.
- Preserve existing user work.
- Keep core platform features separate from optional plugins.
- Distinguish remote service connectors from executable local extensions.
- Treat native capabilities as platform-dependent.
- Avoid unnecessary dependencies and premature framework choices.

You MUST NOT:
- Implement the complete runtime.
- Build all client SDKs.
- Build a full plugin store.
- Implement actual Naviah Sync integration.
- Migrate existing core microservices into plugins.
- Replace the existing project architecture without authorization.
- Install packages or execute destructive commands without a clear need.
- Claim that generated documentation proves the architecture is implemented.
- Invent repository details, requirements, test results, or completed work.

You may create small supporting artifacts, such as a glossary, architecture overview, or ADR templates, when they make the next phase more reliable.

## 12. Definition of Done

This phase is complete only when:

1. The target directory has been inspected.
2. `README.md` accurately describes the intended ecosystem and its boundaries.
3. `TODO.md` contains prioritized, actionable tasks across the necessary phases.
4. Important architectural uncertainties are documented.
5. Existing project files have been preserved.
6. Documentation links and relative paths have been checked.
7. No planned feature is falsely described as implemented.
8. The final response summarizes the files created or modified, important decisions, unresolved questions, and the recommended next task.

## 13. Execution Instructions

Proceed in this order:

1. Inspect the target directory.
2. Summarize the repository findings and any constraints that materially affect the plan.
3. Create or update `README.md`.
4. Create or update `TODO.md`.
5. Add only the supporting architecture documents necessary for clarity.
6. Verify paths, links, task identifiers, dependencies, and status labels.
7. Report the results.

If a critical architectural decision cannot be made safely from available information, document it as unresolved rather than blocking the entire documentation phase.

The immediate goal is a reliable project blueprint and execution roadmap, not a premature implementation.