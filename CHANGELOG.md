# Changelog

All notable changes to Slopwatch are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **M0 — Scaffold & CI.** WXT + React + TypeScript (strict) project skeleton with
  ESLint, Prettier, Vitest (`fakeBrowser`), and Playwright wired up. Typed
  cross-context messaging and typed settings/secrets storage wrappers
  (`storage.session` default for API keys; corrupt-settings → defaults). Stubbed
  `background`, `popup`, `options`, and `content` entrypoints. GitHub Actions CI.
