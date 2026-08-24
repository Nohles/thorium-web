---
name: "Thorium Web Reader — Well-Kept Stacks"
description: "A calm, themeable reader shell whose precise chrome stays subordinate to the publication."
colors:
  theme-background: "var(--th-theme-background)"
  theme-text: "var(--th-theme-text)"
  theme-hover: "var(--th-theme-hover)"
  theme-on-hover: "var(--th-theme-onHover)"
  theme-focus: "var(--th-theme-focus)"
  theme-subdued: "var(--th-theme-subdue)"
  theme-disabled: "var(--th-theme-disable)"
  chrome-surface: "color-mix(in srgb, var(--th-theme-background) 97%, var(--th-theme-text))"
  soft-control: "color-mix(in srgb, var(--th-theme-text) 4%, transparent)"
  selected-surface: "color-mix(in srgb, var(--th-theme-text) 9%, transparent)"
  structural-border: "color-mix(in srgb, var(--th-theme-text) 14%, transparent)"
typography:
  chrome-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.012em"
  sheet-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.012em"
  control-label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.006em"
  compact-meta:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "lining-nums tabular-nums"
rounded:
  compact: "calc(var(--th-layout-radius, 8px) / 2)"
  control: "var(--th-layout-radius, 8px)"
  popover: "calc(var(--th-layout-radius, 8px) * 1.5)"
  modal: "calc(var(--th-layout-radius, 8px) * 1.75)"
  sheet: "20px"
  pill: "999px"
spacing:
  quarter: "calc(var(--th-layout-spacing, 16px) / 4)"
  half: "calc(var(--th-layout-spacing, 16px) / 2)"
  base: "var(--th-layout-spacing, 16px)"
  one-and-half: "calc(var(--th-layout-spacing, 16px) * 1.5)"
  double: "calc(var(--th-layout-spacing, 16px) * 2)"
components:
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.control}"
    padding: "6px"
    size: "36px"
  primary-action:
    backgroundColor: "{colors.theme-text}"
    textColor: "{colors.theme-background}"
    typography: "{typography.control-label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  text-field:
    backgroundColor: "{colors.soft-control}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
    height: "40px"
  selected-option:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.theme-text}"
    typography: "{typography.control-label}"
    rounded: "{rounded.control}"
    padding: "8px"
    height: "40px"
  progression-chip:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.theme-text}"
    typography: "{typography.compact-meta}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  overlay-sheet:
    backgroundColor: "{colors.chrome-surface}"
    textColor: "{colors.theme-text}"
    rounded: "{rounded.sheet}"
    padding: "16px"
    width: "min(600px, 100%)"
  page-turn-affordance:
    backgroundColor: "transparent"
    textColor: "{colors.theme-text}"
    rounded: "0px"
    padding: "0px"
    height: "40dvh"
    width: "var(--th-arrow-size, 40px)"
---

# Design System: Thorium Web Reader

## Overview

**Creative North Star: "Well-Kept Stacks"**

The reader feels like a carefully maintained library stack: calm, capable, bookish, and easy to navigate without competing with the work on the page. Chrome is modern and exact, but publication-first. It preserves the reader's established placement and behavior while making controls, settings, and layers feel more coherent and dependable.

The system gets its character from theme-derived near-neutrals, one-pixel structure, compact geometry, and disciplined density. Host-provided theme, layout, icon, constraint, and scrim variables remain authoritative. Publication typography and publisher styling remain inside the reading surface; system sans is reserved for reader chrome.

**Key Characteristics:**

- Publication-first hierarchy with chrome that recedes until needed.
- Near-achromatic surfaces derived from the active host theme.
- Fine borders and restrained structural elevation.
- Compact controls with visibly roomier overlays.
- Accessible state changes with clear focus and non-color selection cues.
- Stable placement and behavior across desktop and mobile layouts.

## Colors

The palette is relational rather than branded: every chrome surface, rule, and state is derived from the host's active reader theme.

### Primary

- **Host Ink** (`theme-text`): Supplies chrome text, icons, strong outlines, active controls, and inverted action backgrounds.
- **Host Paper** (`theme-background`): Supplies the reading surround, inverse action text, and the base from which chrome layers are tinted.

### Neutral

- **Shelf Surface** (`chrome-surface`): A 97% paper tint used for bars, popovers, dialogs, and sheet headers so chrome separates subtly from the publication.
- **Soft Control Wash** (`soft-control`): A low-contrast ink tint used inside fields and quiet controls.
- **Selected Wash** (`selected-surface`): A stronger ink tint that supports selected states alongside weight, border, checkmark, or inset outline.
- **Fine Rule** (`structural-border`): The standard one-pixel structural border for chrome boundaries and overlay edges.
- **Host Hover** (`theme-hover`) with **Host On-Hover** (`theme-on-hover`): The host-owned interactive pair for hover and pointed focus feedback.
- **Host Subdued** (`theme-subdued`) and **Host Disabled** (`theme-disabled`): Secondary and unavailable-state roles supplied by the host theme.
- **Host Focus** (`theme-focus`): The sole focus-ring role; it must remain clearly visible over the current theme.

### Named Rules

**The Borrowed Palette Rule.** Never introduce a fixed global brand color for reader chrome. Derive structure from `--th-theme-*` values and let publication content keep its own color voice.

**The Tint, Don't Paint Rule.** Create hierarchy with small text-on-background mixes; reserve solid ink fills for primary actions, active tracks, and compact playback controls.

## Typography

**Chrome Font:** System sans (`ui-sans-serif`, `system-ui`, platform fallbacks)

**Publication Font:** Publisher or reader-selected typography inside the publication surface

**Character:** Chrome type is quiet, compact, and utilitarian, with modest weight and slightly tightened headings. The content layer retains the publication's editorial typography instead of inheriting a package-owned face.

### Hierarchy

- **Sheet Title** (650, 1rem, 1.35 line-height): Overlay and settings headings.
- **Chrome Title** (600, 0.9375rem): The centered or compact running head in the reader header.
- **Control Label** (650, 0.875rem, 1.4 line-height): Settings groups, field labels, and emphasized action text.
- **Compact Metadata** (600, 0.8125rem, 1.25 line-height): Progression capsules, compact trigger text, and numeric status; use tabular numerals when values change in place.
- **Supporting Copy** (regular, 0.875–0.9375rem, 1.5–1.55 line-height): Search summaries, errors, empty states, and explanatory text.

### Named Rules

**The Two Typesetting Domains Rule.** System sans belongs to application chrome; publisher and user-selected typography belongs to the publication. Do not make one impersonate the other.

## Layout

The shell fills the visual viewport with both `100vh` and `100dvh` support. Stacked layouts keep header and footer in flow; layered layouts position them over the publication and translate them away in immersive mode. In both cases the reading surface remains the only flexible, min-height-zero region.

The default spatial base is host-controlled (`--th-layout-spacing`, 16px by default), commonly used at quarter, half, base, one-and-a-half, and double multiples. Chrome bars are 2.5 icon units tall (60px at the default 24px icon size). Controls generally land at 36–40px high, while page-turn hit targets extend through 40% of the visual viewport without enlarging their circular visual arrows.

Default behavior breakpoints are 600px, 840px, 1200px, and 1600px. The chrome also uses a 40rem compact layout threshold for header, pagination, and page-arrow adjustments, plus a 100rem wide-display threshold that keeps primary reader actions visible. Overlay widths and heights remain governed by host constraints: 600px modal, popover, and bottom-sheet maxima; 1024px pagination; 250px dropdown height; and the visual viewport for mobile sheets.

**The Placement Is Product Rule.** Visual refinements may change density and material treatment, but they do not relocate reader actions, progression, navigation, or publication content.

**The Invisible Reach Rule.** Page-turn controls use tall invisible targets around compact circular arrows; never shrink the target to the visible disc.

## Elevation & Depth

Depth is structural, not atmospheric. In-flow bars rely on one-pixel rules and theme-derived tonal separation without a shadow. Shadows appear only when a control or surface actually overlaps the reading plane, and use neutral black occlusion so dark themes never turn foreground-colored shadows into light glows.

### Shadow Vocabulary

- **Page Arrow** (`0 2px 8px rgb(0 0 0 / 18%)`): Keeps the compact circular affordance legible over content; hover deepens to 26%.
- **Popover** (`0 10px 30px rgb(0 0 0 / 42%)`): Separates overflow menus and dropdowns.
- **Sheet** (`0 12px 32px rgb(0 0 0 / 42%)`): Separates larger anchored overlays.
- **Modal** (`0 18px 48px rgb(0 0 0 / 52%)`): The strongest elevation, reserved for centered modal dialogs.
- **Bottom Sheet** (`0 -8px 32px rgb(0 0 0 / 56%)`): Lifts a mobile sheet from the obscured reader below.

### Named Rules

**The Structural Shadow Rule.** If a surface does not overlap the publication, use a fine rule or tonal shift instead of a shadow.

**The No Glow Rule.** Drop shadows use neutral black, never theme foreground colors; theme text remains available for borders, focus rings, and control outlines.

## Shapes

Controls use the host radius (8px by default), with 4px used sparingly for tight title links and internal fields. Popovers expand to 12px and modal dialogs to 14px from the same host radius. Mobile bottom sheets use a fixed 20px top radius until they reach full height, when the top corners square off. Progress indicators, switch tracks, slider thumbs, and the visible portion of page-turn arrows are circular or pill-shaped.

Borders are consistently one pixel and are usually mixed from host ink at 10–16% opacity. Stronger 24–34% borders mark selection without becoming heavy frames. The geometry stays compact and maintained: no decorative cut corners, oversized capsules for ordinary controls, or ornamental frames around the publication.

**The Radius Ladder Rule.** Use 8px for controls, 12–14px for floating overlays, and 20px only for mobile sheet tops; pills and circles are reserved for inherently continuous or directional controls.

## Components

### Buttons

- **Shape:** Compact 8px control corners, generally 36–40px high; icon buttons use a 36px square visual control.
- **Primary:** Host ink background with host paper text, a one-pixel ink border, 8px corners, and compact 8px-by-16px padding.
- **Ghost / Icon:** Transparent at rest, then the host hover pair on hover. Pressed state deepens the hover surface rather than introducing a new color.
- **Focus:** A 2px host-focus outline with 2–3px offset. Never remove the visible focus cue.
- **Motion:** Color and opacity changes use 150–160ms ease-out; primary actions may depress by 1px. Under reduced motion, transitions are removed.

### Cards / Containers

- **Corner Style:** 8px for inline setting tiles; 12–14px for floating overlays; 20px top corners for bottom sheets.
- **Background:** Near-neutral paper/ink mixes, never a fixed package brand surface.
- **Shadow Strategy:** Fine borders for in-flow containers; the structural shadow vocabulary only for overlap.
- **Internal Padding:** Usually half or base spacing (8px or 16px at defaults).

### Inputs / Fields

- **Style:** 40px minimum height, a one-pixel 16% ink border, 8px corners, and a 4% ink wash over transparent.
- **Focus:** A 2px host-focus outline with 2px offset.
- **Error / Disabled:** Preserve semantic messaging and use the host disabled role for unavailable controls; do not rely on faded color alone when an explicit label or state is available.

### Navigation

Header and footer navigation stays in its established positions. Reader titles use compact system sans and ellipsis. Tree, listbox, source, and menu rows are 36–40px minimum height with 8px corners. Hover uses the host hover pair; selected rows add a tinted surface plus weight, border, checkmark, or inset outline so selection is never color-only.

### Progression

Progression appears as a compact pill with a 7–9% ink tint, 0.8125rem semibold tabular numerals, and 6px-by-12px padding. It remains visually secondary to the publication and centered between previous and next navigation.

### Page-Turn Affordance

Each page-turn button is a full-height interaction lane occupying 40% of the visual viewport while its visible arrow stays a compact circular disc. The disc uses a fine border, near-paper fill, and restrained shadow. Hover may increase opacity, lift the shadow, and scale the disc to 1.04; focus outlines the disc itself. Reduced motion makes all of these state changes immediate.

### Sheets and Popovers

Overlays use a 97–98% host-paper tint, 14% ink border, sticky 52px header, and 16px body padding. Popovers are constrained to the visual viewport; modal and bottom-sheet widths default to 600px maximum. Mobile sheets use the host scrim, safe-area-aware height, and a keyboard-focusable drag indicator.

## Do's and Don'ts

### Do:

- **Do** let `--th-theme-*`, `--th-layout-*`, `--th-icon-*`, constraint, and scrim variables remain authoritative.
- **Do** preserve publication-first hierarchy, existing component placement, keyboard behavior, RTL behavior, and responsive modes.
- **Do** use one-pixel rules and restrained tonal mixes to organize dense settings and navigation.
- **Do** pair every selected color treatment with weight, border, checkmark, inset outline, or another non-color cue.
- **Do** provide a visible 2px focus outline and make reduced-motion state changes immediate.
- **Do** size full-screen and sheet surfaces against the dynamic visual viewport where the implementation already does so.

### Don't:

- **Don't** introduce a fixed global accent or brand palette that the embeddable reader does not own.
- **Don't** apply publication typography to application chrome or force chrome typography into publication content.
- **Don't** replace the tall page-turn hit target with a small circular button target.
- **Don't** use large shadows, ornamental decoration, or high-contrast surfaces for in-flow chrome.
- **Don't** communicate hover, focus, selection, disabled, or loading state by color alone.
- **Don't** change action placement, information architecture, host theming authority, or reader behavior as part of a visual refinement.
