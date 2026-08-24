# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Thorium Web serves developers and product teams embedding an accessible publication reader into web applications. Its reader is also used by self-hosters through the Reader app on desktop and mobile web, where people expect reading controls to stay unobtrusive and dependable during long sessions.

## Product Purpose

Thorium Web provides reusable React components for reading EPUB, Web Publication, comic, and audio content. It should make accessible, customizable reading behavior available to host applications without forcing them to rebuild navigation, display preferences, publication actions, or reading-state infrastructure.

## Positioning

A reusable, Readium-based web reader that combines publication-format breadth with accessible, configurable reading controls.

## Operating Context

Readers move between focused reading and short control tasks such as changing display preferences, navigating chapters or pages, searching, opening the table of contents, and returning to the host library. The package must work as both a standalone demo and an embedded reader whose chrome can sit coherently inside another product.

## Capabilities and Constraints

- Preserve EPUB, Web Publication, comic, and audio reading behavior and the existing public component API.
- Preserve current actions, preferences, themes, immersive behavior, keyboard support, localization, RTL support, and responsive layouts.
- The current redesign scope is the whole reader shell: header, footer and progression, navigation affordances, settings, table of contents, search, menus, sheets, and loading and error states.
- This redesign is a visual facelift only. Component placement and interaction behavior should remain essentially unchanged; functional or information-architecture changes require separate approval.
- The reader will be integrated into the Reader repository and should inherit that product's established visual language without making Reader-specific branding mandatory for other package consumers.

## Brand Commitments

For the Reader integration, align with Reader's existing calm, capable, bookish character and its restrained, collection-first interface. The publication remains the visual focus; reader chrome should feel maintained and precise rather than promotional, ornamental, or console-like.

## Evidence on Hand

- Existing Thorium Web reader components and CSS modules under `src/components/`.
- Reader's product and design records at `/Users/rich/.t3/worktrees/Reader/t3code-2cfeefab/apps/web/PRODUCT.md` and `/Users/rich/.t3/worktrees/Reader/t3code-2cfeefab/apps/web/DESIGN.md`.
- A live Reader integration at `http://localhost:3000/` demonstrating desktop and mobile reader states.
- No new marketing claims, testimonials, or product imagery are required for this work.

## Product Principles

1. Keep the publication in command; chrome recedes until needed.
2. Preserve familiar, accessible reader behavior while improving visual coherence.
3. Make customization feel approachable even when the preference set is deep.
4. Give host applications a coherent default without reducing themeability.
5. Maintain feature and API compatibility across supported publication formats.

## Accessibility & Inclusion

Maintain the existing accessibility intent and align the integrated experience with Reader's WCAG 2.2 AA target: complete keyboard navigation, visible focus, sufficient contrast, reduced-motion support, semantic screen-reader output, larger text and zoom resilience, and no state communicated by color alone.
