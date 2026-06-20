# Changelog

All notable changes to Backbar are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use conventional commits to determine the next pre-1.0 semver
version.

## [Unreleased]

## [0.3.0] - 2026-06-20

Major PWA improvements and AI-powered bartender chat capabilities.

### Added

- **AI bartender chat dock.** Start conversations with your AI bartender for recipe recommendations, inventory advice, and mixology guidance with persistent chat history.
- **App icons and PWA support.** Install Backbar as a native app with proper icons and manifests for both operator and guest interfaces.
- **Live guest menu publishing.** Your menu selection now properly updates the live guest-facing menu when you click "Publish to Guest."

### Fixed

- **PWA navigation issues.** Bottom navigation now displays correctly in installed PWA mode without disappearing or hiding behind the home indicator.
- **Guest menu URL display.** Menu view now shows your actual configured guest menu URL instead of a placeholder address.

## [0.2.0] - 2026-06-16

Backbar now delivers polished, user-friendly release notes that highlight what actually matters to you.

### Added

- **Human-friendly release notes.** The What's New modal now shows curated feature highlights instead of raw developer commit messages.

## [0.1.0] - 2026-06-16

Initial release bringing AI-powered inventory management and recipe creation to your home bar.

### Added

- **Smart inventory import.** Take photos of your bar shelves and let AI automatically detect bottles, match them to products, and add them to your inventory.
- **AI mixology assistant.** Get personalized cocktail recommendations based on what you have in stock, with intelligent recipe generation.
- **Public menu sharing.** Generate shareable guest menus that show what cocktails you can make, perfect for entertaining.
- **Manual pour tracking.** Log individual pours from any bottle to keep your inventory levels accurate until load cells arrive.
- **Smart shelf integration.** Connect ESP32-based load cells to automatically track bottle levels via MQTT (experimental feature).

### Fixed

- **Mobile responsiveness.** All screens now work properly on phones with collapsible layouts and touch-friendly interfaces.
- **Recipe availability accuracy.** Garnishes and optional ingredients no longer incorrectly prevent recipes from showing as makeable.

## [0.0.0] - 2026-06-12

### Added

- Initial pre-release Backbar workspace baseline.
