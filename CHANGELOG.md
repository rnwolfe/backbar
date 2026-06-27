# Changelog

All notable changes to Backbar are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use conventional commits to determine the next pre-1.0 semver
version.

## [Unreleased]

## [0.8.1] - 2026-06-27

This maintenance release improves mobile recipe viewing and measurement displays.

### Fixed

- **Mobile recipe scrolling.** Recipe details now scroll properly on mobile devices instead of getting cut off at the bottom.
- **Unit display accuracy.** Measurements now show the correct oz and unit labels throughout the app.

## [0.8.0] - 2026-06-27

Enhanced recipe management with attribution tracking and mobile improvements.

### Added

- **Recipe attribution tracking.** Recipes now store author, origin, and notes information that's preserved during import and displayed on recipe details.

### Fixed

- **Mobile recipe navigation.** Recipe panels and navigation icons now display correctly on mobile devices.

## [0.7.0] - 2026-06-26

Introducing reusable recipe components for complex homemade ingredients like syrups and infusions.

### Added

- **Recipe components.** Create reusable sub-recipes for homemade syrups, orgeat, and infusions that can be referenced across multiple cocktail recipes.

## [0.6.0] - 2026-06-26

Smart import improvements prevent duplicate bottles and streamline inventory management.

### Changed

- **Smarter bottle imports.** Photo import now detects when you already have open bottles of a product and skips creating duplicates.

## [0.5.0] - 2026-06-26

Bar Mode brings a streamlined party-service interface with quick pouring controls.

### Added

- **Bar Mode service interface.** A full-screen, touch-friendly interface designed for making drinks during parties with simplified recipe selection and quick pour buttons.
- **Delete bottles from inventory.** Remove bottles you no longer have with a new delete option that safely preserves your historical pour data.

## [0.4.0] - 2026-06-25

This release adds Virginia ABC store integration for real-time local inventory and pricing.

### Added

- **Virginia ABC store integration.** See which nearby stores have bottles in stock and at what price directly from product and bottle pages.

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
