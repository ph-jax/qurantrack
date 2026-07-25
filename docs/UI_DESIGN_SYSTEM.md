# QuranTrack proposed UI design system

> **Review status:** Phase 2.5 is a proposed foundation awaiting product-owner approval. The wordmark treatment, QT code-native monogram, palette, density, and navigation behavior are not a final or approved identity.

## Visual principles

QuranTrack should feel calm, capable, welcoming, and purpose-built for frequent nonprofit education work. Warm ivory pages, white surfaces, deep teal brand actions, dark slate text, and restrained gold details create a subtle learning identity without ornamental backgrounds, calligraphy, glass effects, gradients, or dashboard-template excess. Status colors always accompany text or icons.

## Implementation approach

Tailwind CSS provides a single styling system and maps project-owned CSS variables to utilities. Repository-owned, shadcn-style component source keeps appearance controllable. Radix UI powers behavior that is difficult to implement accessibly—dialogs, alert dialogs, sheets, dropdowns, selects, tabs, checkboxes, and switches. Lucide supplies consistent interface icons. React Router owns routes and layouts; i18next/react-i18next owns localized copy.

These tools are compatible with the repository's current React 19, TypeScript, Vite, and Tailwind 4 installation. Ionic was rejected because QuranTrack needs a desktop education SaaS experience rather than a native-mobile visual model. Material UI, Bootstrap, purchased dashboards, and large admin themes would introduce a competing visual system and generic product identity.

## Tokens and typography

Tokens live in `src/styles/index.css` and cover page, surface, muted, text, divider, brand, accent, interaction, semantic, focus, radius, shadow, sidebar width, and content width values. Components consume semantic utilities rather than scattered color literals. The primary system sans stack avoids runtime font requests. Arabic/Quran samples use a local system fallback stack, explicit `lang="ar"`, and a direction boundary.

Organization accent values pass a strict six-digit hex validator before becoming the controlled `--organization-accent` custom property. Future server-provided colors must use the same validation boundary; arbitrary style text must never be accepted.

## Layout and navigation

At desktop widths the persistent sidebar combines the QuranTrack identity, bounded organization identity, membership switcher, role-aware navigation, and phase note. A sticky top bar contains page identity, locale selector, and user menu. Content uses a generous but bounded maximum width.

Below the desktop breakpoint the sidebar disappears. A 44px menu control opens a focus-managed Radix sheet with the same navigation. Labels and names truncate safely. Logical `start`, `end`, `margin-inline`, `padding-inline`, and border properties prepare the layout for RTL.

## Components and conventions

`src/components/ui.tsx` contains only components exercised by the application or showcase: button/icon button, input/search, textarea, form field, card, badge, alert, spinner, skeleton, select, checkbox, switch, menu, dialog, sheet, confirmation dialog, and tabs primitive. QuranTrack-specific components include the application shell, role navigation, organization identity, statistic cards, responsive learning activity, table/card data views, program hierarchy, and branded empty states.

New shadcn components should be added individually, from the same Radix generation used by the installed packages. Keep source in the repository; translate visible text at call sites; replace default shadcn colors/radii with QuranTrack tokens; include keyboard, focus, disabled, error, and reduced-motion review; and add a real application/showcase use plus a behavior test. Do not install the complete catalog.

## Responsive data rules

Preserve a semantic table where users compare several fields on desktop. At narrow widths, promote identity and status into stacked cards and combine secondary fields rather than forcing uncontrolled horizontal scrolling. A controlled scroll region is acceptable only where side-by-side comparison is essential. All views must be checked at 320px and with realistic Turkish lengths.

## Accessibility

The target is WCAG 2.1 AA. Native landmarks and headings come first. Focus rings remain visible; controls have approximately 44px targets; form help/errors are associated with inputs; dialogs trap and restore focus; navigation exposes current-page state through `NavLink`; status meaning is not color-only; decorative icons are hidden; icon buttons have names; and reduced-motion preferences disable nonessential animation. Browser checks should cover keyboard order, 200% zoom, contrast, and 320px overflow.

## Internationalization and RTL

Resources are separated under `src/i18n/locales`. English is default and Turkish covers all implemented shared/authentication/showcase copy. Selection persists under `qurantrack-language`, updates `<html lang>`, and provides a direction hook. Full Arabic UI translation is out of scope, but components favor logical properties. Arabic learning content remains explicitly RTL inside either LTR application locale.

## Organization branding

QuranTrack identity remains visible. Organization presentation supports name-only, contained logo plus name, failed/missing logo fallback, long names, multiple memberships, and a validated optional accent. Logos use fixed boxes with `object-fit: contain`, so wide or tall assets cannot distort navigation. Upload/settings CRUD is intentionally deferred.

## Development-only showcase

1. Run `npm install` and `npm run dev`.
2. Open `http://localhost:5173/ui-preview`; each sidebar item uses its own `/ui-preview/:section` destination and remains inside fictional preview content.
3. Open `http://localhost:5173/ui-preview/login` for the non-submitting login preview.
4. Change viewport and language, open the drawer/menu/dialog, and inspect the table-to-card transition.

The route uses fictional in-memory examples and no production mutation client. Preview mode always ignores any restored real-session identity; organization selection is local state and the account menu offers no logout or session action. It is included only when Vite compiles with `import.meta.env.DEV`; a production build routes `/ui-preview` to safe not-found and a query parameter cannot enable it.

## Product-owner decisions still needed

- Approve or revise warm-ivory/deep-teal palette and restrained gold usage.
- Approve information density, radii, shadows, sidebar width, and mobile drawer model.
- Approve the temporary text wordmark and whether the neutral QT monogram should remain; it is not presented as a final logo.
- Approve statistic, status, program hierarchy, responsive student card, form, and empty-state treatments.
- Decide whether organization accents should affect only identity elements or selected actions in a later phase.
