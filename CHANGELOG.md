# Changelog

All notable changes to Google Flow MCP are documented here.

## [Unreleased]

### Fixed

- Recognize Flow's new `flow.google.com` origin alongside legacy `labs.google/fx/tools/flow`, rejecting lookalike hosts (fixes account connection failing with `flow_access_unavailable` on migrated accounts, #14)
- Account connection honors the requested selection timeout instead of giving up after ~5 seconds, and reports the final URL plus a diagnostic screenshot on failure (from #15)
- Workspace detection accepts `/project/...` paths and localized **New project** buttons on the new origin
- The agent execution contract now forbids generic browser automation of `flow.google.com` as well as `labs.google`
- On Windows, an elevated MCP no longer fails with "Chromium exited before CDP was ready (exit code 0)": Chrome's de-elevation relaunch is treated as a handoff, and managed browsers close via CDP so no orphan blocks later launches
- Current Flow UI support (fixes `ui_changed` "Flow Agent settings could not be opened", #21): icons render as `<mat-icon>` instead of `<i>`; Agent mode is an opt-in chip that is now enabled before opening its settings; the "Never ask" preference is a Material radio (`value="2"` in `agent-settings-confirm-policy-label`) instead of `value="AUTO_APPROVE"`; ratio/output choices are `role="radio"` toggles in `radiogroup`s instead of tabs; the settings panel closes via Back

- Agent settings panel and model menus animate over seconds; open/close/read now wait on actual state (up to 8s) instead of fixed 0.3-0.4s delays, and Material menus that ignore Escape are dismissed via their backdrop
- Navigating to the legacy Flow URL no longer fails with "interrupted by another navigation" when Google redirects it to `flow.google.com`
- Headless Chrome launches at 1440x900; at its ~750px default Flow hides the Agent toggle and settings, so capability inspection silently fell back to the legacy reader
- Generated images are detected again (gallery tiles are `flow.google.com/asb/...` with `data-media-id`; the account avatar is no longer mistaken for media), fixing "did not expose a credit confirmation or begin generation" timeouts after successful generations
- Downloads request the full-resolution original (`=d`) instead of the 512px WebP gallery thumbnail
- Videos are detected again (current Flow shows `<flow-video-tile>` thumbnails, not `<video>` elements) and download as the real 720p MP4 (`=m22`, then `=m18`); image detection no longer matches video thumbnails
- Media identity is stable: `/asb/` assets are also keyed by token, so a hovered video tile (thumbnail swapped for a player) is not mistaken for new output, and older job records still resolve
- New outputs must precede every previously known tile (Flow inserts at the top); the baseline waits for a fully loaded, stable gallery. Previously a lazy-loaded older video could be returned as a new generation
- Upscale options are classified from Flow's labels ("1080p Upscaled", "720p Original size"), so `availableUpscales` is populated; nested asset menus are fully closed
- Robustness from review: Agent toggle/model menus waited on rather than fixed delays; Save scoped to the panel's text button; the selected model is verified after switching; model groups classified by family; credit-approval detection limited to real approval buttons; clear error when Chrome hands off to a browser already using the profile

### Added

- Generation tools default to `model: "best"` (highest-quality available model, re-evaluated live); `flow_inspect_account` reports `bestModels`; retirement badges are exposed as `note`

### Security

- Updated `@modelcontextprotocol/sdk` to 1.32.x, `zod` past the 4.6.6 advisory, and transitive `body-parser`, `fast-uri`, `hono`, `qs`, `ip-address`, `proxy-addr`; `npm audit` reports 0 vulnerabilities

### Added

- Claude Code setup instructions and `examples/claude-code.mcp.json`

## [0.2.3] - 2026-07-19

### Fixed

- Every generation now persists Flow Agent's language-independent `AUTO_APPROVE` setting inside the isolated managed Chromium profile
- The MCP saves the preference, reopens Agent settings, and verifies that **Never ask before generating** actually persisted before submission
- If Flow still exposes an approval card, the MCP selects the final persistent **Approve and don't ask again** action instead of the one-time approval
- Individual asset `/edit/...` URLs are canonicalized back to their project workspace before generation so Agent settings are always reachable
- Agents are explicitly prohibited from handling Flow approval UI or asking users to interact with the hidden managed browser

## [0.2.2] - 2026-07-19

### Fixed

- Video readiness now verifies the exact generated media URL instead of requiring hidden Flow `<video>` elements to preload metadata
- Initial generation waits are bounded to 20 seconds; queued work returns a persistent `processing` job so later account operations are not blocked indefinitely
- Status polling finalizes downloads already authorized by the original generation request
- Original media downloads use the tracked asset URL directly, eliminating gallery visibility, ordering, localization, and context-menu failure modes
- Multiple MCP processes now reuse a shared per-account Chromium CDP session and coordinate account operations across Antigravity chats
- `flow_begin_account_connection` refuses unnecessary onboarding when a verified default account already exists
- Failed new account connections remove their temporary account record instead of accumulating misleading entries

### Agent contract

- A `processing` generation must be polled with the same job ID and must never be resubmitted merely because Flow queued it
- `flow_list_accounts` exposes explicit `readyForGeneration` and `connectionRequired` booleans

## [0.2.1] - 2026-07-19

### Fixed

- Replaced positional “last gallery item” downloads with exact per-job asset identity tracking
- Generation now snapshots pre-existing media, records only newly created asset identities, and carries them through status, upscale, and download operations
- Multi-output jobs wait for the requested number of new, ready assets instead of accepting the first count increase
- Missing or ambiguous asset identities fail closed instead of downloading an unrelated older asset
- Added regression tests for reordered galleries, durable URL matching, and ambiguous identity rejection

## [0.2.0] - 2026-07-19

### Added

- Supported `npm run setup:antigravity` installer using Antigravity's official global stdio MCP config structure
- Hard installer contract in `AGENTS.md` and a complete numbered first-run guide in `INSTALL.md`
- `flow_help` for natural-language capability explanations and concrete request examples
- `flow_begin_account_connection`, which returns extension instructions immediately and forces the agent to stop for user action
- `flow_complete_account_connection`, which runs only after the extension session has been sent
- Bridge arming so the extension targets the MCP instance that requested account connection when multiple local clients are running
- Clean-install tests for config preservation, absolute stdio paths, scratch-directory refusal, and untouched browser configuration

### Changed

- Removed the blocking `flow_connect_account` tool to prevent agents from hiding a required extension click inside a five-minute tool call
- Flow Login Bridge now tells the user to return to the agent after the session is sent, before the temporary account chooser step
- Installer validation refuses modified tracked source and disposable Antigravity scratch clones
- Installer runs `npm ci`, all 25 tests, package dry-run validation, and normal system-browser detection before changing MCP config

### Installer rules

- No source patches during installation
- No `npx playwright install chromium`
- No generated MCP schema files
- No speculative browser flags or remote-debugging setup
- No replacement of unrelated MCP config entries

## [0.1.1] - 2026-07-19

### Fixed

- Added MCP initialization instructions that require agents to use `flow_*` tools exclusively and prohibit generic browser/computer-use fallback on the Flow website
- Distinguished an authenticated Google identity from an available Flow generation workspace
- Detects the public/marketing Flow page structurally and fails with `flow_access_unavailable` before searching, scrolling, or configuring generation controls
- Tracks `unverified`, `connected`, `needs_reconnect`, and `access_unavailable` account states
- Makes the most recently verified connection the default and prevents stale or unverified profiles from starting generation
- Allows account IDs to be omitted so agents use the verified default instead of guessing
- Added explicit agent next-action guidance to account and capability responses
- Added regression coverage for landing-page classification, verified defaults, unavailable accounts, MCP server instructions, and generation tool schemas
- Documented a stable Antigravity installation path so MCP entrypoints are not lost when its scratch directory is cleaned

## [0.1.0] - 2026-07-19

### Added

- Local stdio MCP server with nine Flow tools
- Flow Login Bridge extension for reusing existing Chromium Google accounts
- Isolated persistent sessions and queues for multiple accounts
- Live, language-independent model, ratio, output-count, duration, and asset-option discovery
- Normalized IDs for Omni Flash, Veo, and Nano Banana model families
- Credit-confirmation gates for generation and upscaling
- Persistent generation jobs with status polling
- Structural detection of preview, original, available upscale, and unavailable/upgrade-only choices
- Browser download capture with `.flow.json` manifests, SHA-256, and optional FFprobe metadata
- Codex, Antigravity, generic MCP, and Remotion documentation
- Windows/Linux CI across Node.js 20 and 24

### Live validation

- Existing-account connection from normal Chromium
- Spanish-language Flow capability discovery
- Real Omni Flash 16:9 video generation
- Persistent queue polling and original-resolution video download
- H.264, duration, and resolution validation through FFprobe

### Known limitations

- Google Flow UI automation can require selector updates when the website changes
- Browser extension installation currently uses developer-mode “Load unpacked” setup
- Live image, reference-file, upscale-download, macOS/Linux browser, and multi-account concurrency paths need broader opt-in validation

[0.1.0]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.1.0
[0.1.1]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.1.1
[0.2.0]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.2.0
[0.2.1]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.2.1
[0.2.2]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.2.2
[0.2.3]: https://github.com/retrolyze52/google-flow-mcp/releases/tag/v0.2.3
