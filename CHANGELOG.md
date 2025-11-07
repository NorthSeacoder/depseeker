# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2025-01-XX

### Added

- ESLint and Prettier configurations for better code quality
- Comprehensive npm scripts for development workflow
- Coverage reporting with vitest
- CHANGELOG.md to track changes
- Better TypeScript types and exports
- Enhanced package.json metadata and description
- Structured error handling system
- Progress callback option for long-running analyses

### Changed

- Upgraded all dependencies to latest stable versions:
  - @babel/parser: ^7.23.0 → ^7.28.5
  - @babel/traverse: ^7.23.0 → ^7.28.5
  - typescript: ^5.5.4 → ^5.9.3
  - vitest: ^2.0.5 → ^4.0.7
  - @types/node: ^22.13.8 → ^24.10.0
  - tsup: ^8.2.4 → ^8.5.0
  - And more...
- Improved npm scripts organization and consistency
- Better code organization and modularity
- Enhanced error messages with more context

### Fixed

- Fixed require.resolve usage in ESM mode
- Fixed recursive readdir path handling
- Corrected package.json keywords (fixed typo: "praser" → "parser")
- Improved type safety across the codebase

### Removed

- Removed unused ResolutionError type from exports (kept internal)

## [0.0.4] - Previous Version

### Initial Features

- Basic dependency analysis for JavaScript and TypeScript
- Support for ES modules, CommonJS, and dynamic imports
- TypeScript path alias resolution
- Configurable file extensions and exclusion patterns
- Optional npm package inclusion
- Recursive directory scanning
