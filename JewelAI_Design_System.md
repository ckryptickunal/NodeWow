# JewelAI Design System

> **Document type:** Authoritative UI design and implementation reference for the Jewel web app (`frontend/`).  
> **Audience:** Human designers and developers, and **automated agents (LLMs)** implementing or reviewing UI.  
> **Last updated:** April 23, 2026  
> **Status:** Describes what the codebase **actually implements**, with explicit notes where multiple visual languages coexist (customer app vs. admin/tooling surfaces).

**Table of contents:** [Principles & stack](#product-design-principles-high-level) · [Shell & nav](#1-global-layout-and-shell) · [Color & type](#2-color-system) · [Layout](#4-spacing-and-layout) · [Components](#6-component-reference-source-files) · [Patterns](#7-patterns-and-recipes) · [Auth & public](#15-unauthenticated-auth-and-special-routes) · [Loading](#16-loading-states-route-level) · [Overlays & z-index](#17-overlays-z-index-and-portals) · [More components](#18-extended-component-behaviors) · [LLM pitfalls](#20-llm-anti-patterns-full-list) · [Route index](#21-full-frontend-route--component-index) · [Maintenance](#22-document-maintenance)

---

## How to use this document (especially for LLMs)

1. **Precedence when styles conflict**
   - **CSS variables** in `src/app/globals.css` (`:root`) define canonical brand tokens (`--accent`, `--bg`, etc.).
   - **Tailwind theme extension** in `tailwind.config.ts` maps those variables to utilities (`bg-accent`, `text-white-50`, etc.).
   - **Shared components** under `src/components/ui/` define default classes; **pages** often override via `className` using `cn()` from `src/lib/utils.ts`.
   - If a page uses a one-off hex (e.g. `#0d0d0d`) instead of a token, treat the page as the source of truth for that instance unless you are **refactoring toward tokens** as an explicit task.

2. **Do not “normalize” these intentional splits**
   - **Customer experience** (dashboard, generate, collection, payments, settings): **orange** accent `#ff5b00`, dark charcoal surfaces, high-contrast marketing typography.
   - **Admin / dense tooling** (e.g. generations admin): may use **zinc** neutrals and **fuchsia** focus/gradient accents for data-heavy UIs. This is **not** an error; document and match surrounding files when editing admin pages.

3. **Before adding new UI**
   - Reuse `Button`, `Card`, `StatusBadge`, `FilterSelect` (where appropriate), and existing layout classes from `AppShell` / `Navbar`.
   - Merge classes with `cn()` to avoid duplicating or fighting Tailwind specificity.

4. **Verification**
   - Prefer reading the listed **source files** over guessing class names. Tailwind only generates classes present in `content` paths (see `tailwind.config.ts`).

---

## Product design principles (high level)

- **Dark-first:** Primary surfaces are near-black and charcoal; text is white with stepped opacity for hierarchy.
- **Single strong accent:** Orange (`#ff5b00`) is the main CTA and “active” signifier in the **customer** shell (sidebar, key buttons, focus borders).
- **Typographic energy:** Display headlines use **Big Shoulders Display** (`font-display`); body/UI uses **DM Sans** (`font-body`). Uppercase, wide tracking labels are common for small caps / metadata.
- **Soft geometry:** Large radii (`rounded-[40px]`–`rounded-[56px]`) on hero cards; pill buttons (`rounded-[70px]` / `rounded-full`).
- **Motion is restrained but present:** `animate-in` for page blocks; `active:scale-[0.98]` on buttons; hover border glow on accent. Avoid introducing long or irrelevant animations on high-frequency actions (align with the engineering animation checklist in internal skills if applicable).

---

## Technical stack (UI-relevant)

| Layer | Technology | Notes |
| --- | --- | --- |
| Framework | Next.js (App Router) | Routes under `src/app/` |
| Styling | Tailwind CSS + `globals.css` | `cn()` = `clsx` + `tailwind-merge` |
| Icons | `lucide-react` | Consistent stroke icons |
| Fonts | `next/font/google` | `Big_Shoulders_Display`, `DM_Sans` in `layout.tsx` |
| Theming | `className="dark"` on `<html>` | Dark mode assumed; `scroll-smooth`, `[scrollbar-gutter:stable]` on root |
| Images | `next/image` where optimized; `unoptimized` + `fill` in some modals | See `ImageWithLoader` / `ImageLightbox` |
| Phone input | `react-international-phone` / `react-phone-number-input` | Themed in `globals.css` (see §7.6 / §15.5) |
| Admin charts | `recharts` | Used on `/admin` dashboard — match chart text/tooltip/axis colors in file when adding series |
| Analytics | PostHog (provider) | Not a visual system; do not add UI deps here |

**Root layout** (`src/app/layout.tsx`):

- Loads font CSS variables: `--font-big-shoulders`, `--font-dm-sans`.
- `body` uses `font-body min-h-screen bg-background text-foreground antialiased` (maps to CSS tokens).

---

## 1. Global layout and shell

### 1.1 `AppShell` (authenticated)

**File:** `src/components/layout/AppShell.tsx`

- **Public routes** (no nav shell): `/`, `/login`, `/forgot-password`, `/onboarding`, `/verify-email`, `/terms`, `/privacy` — render `children` only.
- **Auth gating:** Unauthenticated non-public → redirect to `/login`; email verification and onboarding gating as implemented in the file.
- **Loading state:** Centered `Loader2` with `text-accent` and `text-white-50` helper copy.
- **Main structure:** `min-h-screen bg-[#121212] flex flex-col lg:flex-row`, `Navbar` + `main` with `lg:ml-[260px]`.
- **Content container:** `mx-auto max-w-[1400px] px-4 py-8 md:px-8 lg:pl-12 lg:pr-[5.5rem]` on the inner `div`.
  - **Right padding** `lg:pr-[5.5rem]`: reserves space for the **notification bell** (`NotificationBellButton`) in a `fixed` top-right strip on large screens (see `pointer-events` pattern in the same file: only the bell is interactive, not the full overlay strip).

### 1.2 `Navbar` (customer + admin links)

**File:** `src/components/layout/Navbar.tsx`

- **Width:** `w-[260px]` fixed desktop sidebar; mobile uses sticky header + drawer.
- **Background:** `bg-[#0a0a0a]`, `border-r border-[#1a1a1a]`.
- **Primary nav items (customer):** Dashboard, New Generation, **Tutorials**, Social Media, **Gallery**, Collection, Payments — each with icon + label; active state uses **orange** pill (see below).
- **Admin block:** Renders only if `isAnyAdmin` and per-link **permission** (`hasPermission`); section label “ADMIN” with `Shield` icon; active state uses `bg-white/10 text-white` (not orange — intentional distinction).
- **Legal block:** Terms & Conditions, Privacy Policy — same active pattern as admin (`bg-white/10`).
- **Promo:** `FreeCreditsClaimCard`, optional discount card with `Promo small.webp`, orange badge and CTA.
- **User area:** Bottom card with avatar gradient circle, user menu to Settings + Logout; menu panel `rounded-[24px]`, `bg-[#0d0d0d]`, `border-[#1a1a1a]`.

**Customer nav link (active):**

`bg-[#ff5b00] text-black shadow-[0_0_20px_rgba(255,91,0,0.15)]`

**Customer nav link (inactive):** `text-[#999]`, `hover:bg-white/5 hover:text-white`, icons `text-[#666]` → `text-[#ff5b00]` on hover.

**Logo:** `font-display text-4xl font-black uppercase tracking-[4px]` — `Jewel` white, `AI` orange.

---

## 2. Color system

### 2.1 CSS variables (`globals.css` `:root`)

| Token | Variable | Role |
| --- | --- | --- |
| Page background | `--bg` `#121212` | `body` / `bg-background` |
| Accent | `--accent` `#ff5b00` | Primary CTA, focus rings on customer pages |
| Accent hover | `--accent-hover` `#ff7f3a` | Hover for primary actions |
| White steps | `--white` … `--white-5` | Opacity steps for text, borders, fills |
| Muted | `--muted` `#999999` | Secondary labels |
| Step number (legacy token) | `--step-num` `#5c5c5c` | Steppers / disabled numerals where used |
| Blue | `--blue` `#0099ff` | Available in theme; use sparingly |

**Tailwind mapping** (`tailwind.config.ts`): `background: var(--bg)`, `foreground: var(--white)`, `accent.DEFAULT`, `accent.hover`, `white.80` … `white.5`, `muted`, `step-num`, `blue`.

### 2.2 Common hard-coded surfaces (pages)

These appear repeatedly in JSX when cards need a slightly different depth than the page:

| Value | Role |
| --- | --- |
| `#0d0d0d` | Default “card” surface |
| `#0a0a0a` | Sidebar / deeper strip |
| `#1a1a1a` | Default 1px border color |
| `#080808` / `#000000` | Gradient endpoints, image overlays |
| `rgba(255,91,0,0.3)` | Hover / focus **ring** on bordered cards and inputs |

### 2.3 Semantic state colors

| Meaning | Palette | Typical usage |
| --- | --- | --- |
| Success / OK | `emerald-500` / `emerald-400` | Purchases, completed generations (`StatusBadge`, tables) |
| Error | `red-500` / `red-400` | Failed states, validation |
| Warning / in-progress | `amber-500` / `white/60` | Processing, pending (component-dependent) |
| Neutral / info | `zinc-*` | Admin list meta, pending rows |

**Important:** The shared `StatusBadge` uses **emerald** for `completed`, not orange. Do not reintroduce orange for “success” in this component without a product-level change.

### 2.4 Admin / tooling accent (secondary)

**Example:** `src/app/admin/generations/page.tsx` defines patterns like `border-fuchsia-950/30`, `from-fuchsia-950/15`, and `FilterSelect` uses **fuchsia** focus rings and **zinc** borders. When building **new admin** screens, follow **nearby admin pages** and `FilterSelect` rather than restyling to orange “for consistency.”

---

## 3. Typography

### 3.1 Font roles

| Role | Class / variable | Weights (loaded) |
| --- | --- | --- |
| Display / brand | `font-display` → `--font-big-shoulders` | 400–900 (see `layout.tsx`) |
| Body / UI | `font-body` → `--font-dm-sans` | 300–700 |

`tailwind.config.ts` maps both `fontFamily.display` and `fontFamily.body` to the respective CSS variables.

### 3.2 Base heading rule (`globals.css`)

All `h1`–`h6`: `font-body font-bold tracking-tight text-white` (Tailwind `@apply`).

### 3.3 Scale (observed patterns)

- **Page H1:** Often `text-5xl md:text-[72px] font-display font-black tracking-tight` (marketing-style titles).
- **Section labels:** `text-[10px]`–`text-[12px] font-black uppercase tracking-[3px]` with optional small orange dot prefix (`h-1.5 w-1.5 rounded-full bg-[#ff5b00]`).
- **Body:** `text-sm`–`text-[15px] font-medium` with `text-white/60`–`text-[#999]` for secondary.
- **Buttons (component):** `font-body font-bold uppercase tracking-widest`.

**Letter spacing:** `tracking-tight`, `tracking-tighter`, `tracking-widest`, and custom `tracking-[3px]` / `tracking-[4px]` for all-caps lines.

---

## 4. Spacing and layout

### 4.1 CSS layout tokens (`globals.css`)

| Variable | Desktop | Mobile (≤809px) |
| --- | --- | --- |
| `--section-padding` | 80px | 60px |
| `--page-padding-x` | 40px | 20px |
| `--section-gap` | 80px | — |
| `--content-max-width` | 1200px | — |

Tailwind: `py-section-y`, `px-page-x`, `max-w-content` (as configured).

**Note:** The **live** `AppShell` main column uses the explicit `max-w-[1400px]` + responsive `px-*` pattern; the `--content-max-width` token is available but not always the binding constraint in JSX.

### 4.2 Vertical rhythm (common)

| Pattern | Class | Context |
| --- | --- | --- |
| Tight sections | `space-y-10` (40px) | Dashboard |
| Looser sections | `space-y-12`–`space-y-16` | Settings, payments, long forms |

### 4.3 Grids (representative)

Documented in page audits: stats `md:grid-cols-2 lg:grid-cols-3` + `gap-6`; pricing `gap-8`; history image grid up to 5 columns on large screens. When adding a new page, **copy an existing page with similar density** (form vs. dashboard vs. table).

---

## 5. Radii, borders, and elevation

### 5.1 Token radii (`globals.css`)

| Token | Value | Tailwind if mapped |
| --- | --- | --- |
| `--radius-pill` | 70px | `rounded-pill` |
| `--radius-badge` | 30px | `rounded-badge` |
| `--radius-card` | 15px | `rounded-card` |
| `--radius-image` | 10px | `rounded-image` |

### 5.2 In-app radii (overrides are normal)

- **Pill actions:** `rounded-[70px]` (buttons), `rounded-full` (icon circles, avatars in places).
- **Large cards:** `rounded-[48px]`, `rounded-[40px]`, **pricing** up to `rounded-[56px]` / `72px`.
- **Inputs / search:** often `rounded-[24px]` or `rounded-[32px]`.

**Elevation:** `shadow-2xl`, `shadow-[0_20px_50px_rgba(0,0,0,0.8)]` for menus; orange glow on primary CTA via layered `shadow` + `hover:shadow`.

---

## 6. Component reference (source files)

| Component | File | Role |
| --- | --- | --- |
| `Button` | `src/components/ui/Button.tsx` | Variants: `primary`, `secondary`, `outline`, `ghost`; sizes `sm` / `md` / `lg`; loading spinner; `focus-visible:ring` accent |
| `Card` | `src/components/ui/Card.tsx` | Base: `rounded-xl border border-white-20 bg-white-10 p-6` — expect heavy `className` overrides |
| `StatusBadge` | `src/components/ui/StatusBadge.tsx` | `pending` / `processing`, `completed`, `failed` — see semantic colors |
| `FilterSelect` | `src/components/ui/FilterSelect.tsx` | Styled native `<select>` for **admin** filters; zinc surface; fuchsia focus; `compact` and `fullWidthMobile` props |
| `ActivityRow` | `src/components/ui/ActivityRow.tsx` | Collection / dashboard expandable rows |
| `LoadMoreButton` | `src/components/ui/LoadMoreButton.tsx` | Pagination helper |
| Download / image helpers | `DownloadToast`, `RetryImage`, `ImageWithLoader` | Download UX and image error recovery |

**Barrel export:** `src/components/ui/index.ts` — import shared UI from `@/components/ui` where possible.

### 6.1 `Button` (authoritative)

- **All variants** default to **pill** geometry via per-size `rounded-[70px]`.
- **Primary:** `bg-[#ff5b00] text-black` → `hover:bg-[#ff7f3a]`, shadow ramps, `active:scale-[0.98]`, `duration-300`.
- **Focus:** `focus-visible:ring-1 focus-visible:ring-[#ff5b00]/50`.
- **Typography:** `font-body font-bold uppercase tracking-widest` (in addition to size classes).

### 6.2 `FilterSelect` (admin / dense filters)

- **Wrapper:** `relative min-w-0`, width controlled by `fullWidthMobile` and `className`.
- **Select:** `appearance-none`, `border-zinc-700`, `bg-zinc-900/80`, `text-zinc-100`, custom **ChevronDown** absolute right (no native arrow misalignment).
- **Focus:** `focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20` (or tighter ring in `compact` mode).
- **Use when:** Building admin list filters, per-page size selectors, or any native `select` that must match the admin look.

**LLM instruction:** Do not replace fuchsia with orange solely for “brand alignment” on admin without explicit direction; doing so can break visual consistency with existing admin pages.

### 6.3 `StatusBadge` (correct semantics)

- **Processing / pending:** `bg-white/5 border-white/10 text-white/60` + optional ping dot.
- **Completed:** `bg-emerald-500/10 border-emerald-500/20 text-emerald-400` + `CheckCircle2`.
- **Failed:** `bg-red-500/10 border-red-500/20 text-red-400` + `AlertCircle`.

Labels come from `statusLabel()` in `src/lib/utils.ts` (e.g. “Needs Attention” for failed).

---

## 7. Patterns and recipes

### 7.1 “Section label” row

Small all-caps label, sometimes with orange dot:

```text
flex items-center gap-2
  • dot: h-1.5 w-1.5 rounded-full bg-[#ff5b00]
  • text: text-white text-[12px] font-black uppercase tracking-[3px]
```

### 7.2 Marketing / hero card

- Container: `rounded-[40px]` or `rounded-[48px]`, `bg-[#0d0d0d]` or `bg-black`, `border border-[#1a1a1a]`, hover `hover:border-[#ff5b00]/30`, `shadow-2xl` or custom shadow, optional background image with gradient overlay and `group-hover:scale` on image.

### 7.3 Tables (payments / subscription history)

- `table-fixed w-full border-collapse`, header `text-[11px] font-black uppercase tracking-widest text-[#444]`, row hover `hover:bg-white/[0.015]`, cell padding often generous (`py-8`–`py-12`).

### 7.4 Filter pills (customer)

Two families exist:

- **Orange active pill** (e.g. some subscription views): `bg-[#ff5b00] text-black` for active, muted gray for inactive, container `bg-[#0d0d0d] rounded-full p-2 border border-white/5`.
- **White active pill** (e.g. collection type filters): active `bg-white text-black` with border/shadow; inactive transparent — always **match the page you are editing**.

### 7.5 Tutorials page (`src/app/tutorials/page.tsx`)

- **Video card:** `rounded-[32px] bg-[#0d0d0d] border border-[#1a1a1a]`, 16:9 area with YouTube `nocookie` embed on play; thumbnail from `img.youtube.com`, hover scale and orange play **fab** `bg-[#ff5b00]`.
- **Focus / a11y:** `focus-visible:ring-2 focus-visible:ring-[#ff5b00]` on play target; `aria-label` on controls.

**LLM note:** Reuse this card shell if adding more video resources; keep **embed** and **lazy image** behavior for performance.

### 7.6 International phone input (`globals.css`)

Classes `.phone-input-dark` and `.phone-input-dark-lg` style `react-international-phone` for dark UI; `.phone-readonly` for disabled styling. If changing form field aesthetics, update these in **one place** in `globals.css`.

---

## 8. Scrollbars

Defined globally in `globals.css`:

- **Firefox:** `scrollbar-width: thin`, `scrollbar-color: #2a2a2a transparent`
- **WebKit:** 4px wide, `#2a2a2a` thumb, `9999px` radius, track transparent

`Navbar` may use `no-scrollbar` / `scrollbar-hide` for the scrollable link region — do not remove unless replacing with an accessible alternative pattern.

---

## 9. Motion and interaction

- **Page-level:** `animate-in fade-in duration-700` and directional `slide-in-from-*` on many page wrappers.
- **Buttons:** `active:scale-[0.98]`; primary uses `transition-all duration-300`.
- **Images / cards:** `group-hover:scale-105` common on thumbnails.
- **Accordions / expanders:** `transition-all duration-300`–`500`, grid row collapse patterns in some components.

**Accessibility:** If adding new motion, consider `prefers-reduced-motion` (not universally wired today — a good **future** improvement, not a requirement for every new line unless the motion is long or distracting).

**Keyboard:** Primary buttons use `focus-visible` ring — preserve when splitting components.

---

## 10. Data formatting utilities

**File:** `src/lib/utils.ts`

- **`formatDate`:** `en-IN` date + 12h time, comma-separated.
- **`formatPrice`:** `Intl.NumberFormat` `en-IN`, `INR`, 0 fraction digits.
- **`statusColor` / `statusLabel`:** used in tables and labels; keep StatusBadge and table chips aligned with these semantics when possible.

---

## 11. Route map (UI-relevant, non-exhaustive)

**Customer (in-nav):** `/dashboard`, `/generate`, `/tutorials`, `/social`, `/gallery`, `/history`, `/subscription`  
**Settings / help:** `/settings`, `/help` (help linked from mobile header)  
**Legal:** `/terms`, `/privacy`  
**Admin (permission-gated):** `/admin` (KPI **dashboard**), `/admin/users`, `/admin/credits`, `/admin/generations`, `/admin/gallery`, `/admin/payments`, `/admin/notifications`, `/admin/emails`, `/admin/dead-letters`, `/admin/settings`, `/admin/providers`, `/admin/team`, plus user detail `/admin/users/[id]`

**LLM note:** The `/admin` route renders a real dashboard (charts, KPIs) — it does **not** only redirect. Verify route behavior in `src/app/admin/page.tsx` when describing flows.

---

## 12. Recent evolution (from git history — themes only)

The following themes appear in **recent** frontend work and explain optional UI you may need to align with:

- **Gallery and collection UX:** Public `/gallery` and history grids; image loading and download toasts.
- **Tutorials:** YouTube embeds, mobile-friendly `playsinline` and failure fallback (generate/tutorials surfaces).
- **Admin expansion:** Generations, payments, emails, dead letters, providers, RBAC-gated nav; filter toolbars; `FilterSelect` and compact paginator controls.
- **Global polish:** Themed scrollbars, notification bell with non-blocking `pointer-events` pattern, free-credits and subscription card tweaks.

When unsure, `git log -- frontend/src` for the relevant page path.

---

## 13. Scalability: how to extend the system

### 13.1 Add a new design token

1. Add to `:root` in `globals.css` with a clear `--kebab-case-name`.
2. Expose in `tailwind.config.ts` `theme.extend` if you need utility access (colors, spacing, radii).
3. Prefer semantic names (`--surface-card-elevated`) if the value will repeat across many files.

### 13.2 Add a new shared component

1. Place in `src/components/ui/`.
2. Export from `index.ts` with explicit `Props` type.
3. Use `forwardRef` when wrapping native elements that need ref forwarding (e.g. `Button`).
4. Default + `className` merge via `cn()`.

### 13.3 New page checklist

- Wrap content in the same `main` width behavior as peers (rely on `AppShell` — **do not** reintroduce a second `max-w` unless necessary).
- Use `font-display` / `font-body` consistently for titles vs. body.
- Reuse `Button` variants instead of raw `<button>` with ad-hoc classes unless a one-off is clearly justified.
- For admin: start from the closest existing admin list page and match filter bars + table density.

### 13.4 Common LLM / contributor mistakes to avoid

> **Full expanded checklist:** [§20 LLM anti-patterns (full list)](#20-llm-anti-patterns-full-list).

| Mistake | Why it fails | Prefer |
| --- | --- | --- |
| “Fixing” admin fuchsia/zinc to orange | Admin pages intentionally differ | Match `FilterSelect` / admin generations |
| Using orange for all “success” | Conflicts with `StatusBadge` and tables | Emerald for success, orange for **brand/CTA** |
| `transition-all` on everything | Unpredictable performance / odd interpolations | Transition specific properties (project pattern often uses `transition-all` on small surfaces — be deliberate on new code) |
| Hardcoding colors without checking tokens | Drift and dark-mode risk | Reuse `accent`, `background`, or established hex from same page |
| Ignoring `lg:pr-[5.5rem]` when bypassing `AppShell` | Notification bell overlap | Keep shell structure unless building a special full-bleed layout intentionally |

---

## 14. Appendix: customer UI audit notes (condensed from implementation)

The following sections retain **concrete** class recipes that appear across **customer** pages. They are not exhaustive; prefer inspecting the referenced route files when in doubt.

### 14.1 Color palette (quick reference)

- **Page bg:** `#121212` | **Sidebar:** `#0a0a0a` | **Card surface:** `#0d0d0d` | **Border:** `#1a1a1a`
- **Accent:** `#ff5b00`, hover `#ff7f3a` | **Text secondary:** `#999`, `#666`, `#444` depending on level

### 14.2 `Card` overrides (typical)

```text
bg-[#0d0d0d] border-[#1a1a1a] rounded-[48px] p-10 shadow-2xl
hover:border-[#ff5b00]/30 transition-all duration-300
```

### 14.3 Inputs (settings / forms pattern)

- Height often `h-16`, `bg-black/40`, `border border-white/5`, `rounded-[24px]`, `px-8`, `focus:border-[#ff5b00]/30`, placeholder `text-white/20`.

### 14.4 Stepper (generate flow)

- Circles `h-10 w-10`, `border-2`, active/complete `bg-[#ff5b00] border-[#ff5b00] text-black`, pending muted borders and `text-[#333]`.

### 14.5 Page snapshots (illustrative)

- **Dashboard:** Welcome H1, promo banner, 3-up stats (`hidden lg:block` for third in some layouts), `ActivityRow` list.
- **Generate:** File drop zone, mode cards, style image grid, stepper, refinement modals, error toasts.
- **Collection / history:** Time grouping, search, type filters, lightbox, download actions.
- **Payments:** Credit balance, pricing cards with large radii, transaction table, success banners.
- **Settings:** Profile card with glow blob, phone/Instagram field patterns, FAQ accordion, role badge with pulse dot on orange pill.

---

## 15. Unauthenticated, auth, and special routes

These views **do not** use `AppShell` / `Navbar` (see `PUBLIC_PATHS` in `AppShell.tsx`). Styling must still match the dark/orange system so handoffs from marketing → login → app feel continuous.

### 15.1 Home / marketing (`/`)

**File:** `src/app/page.tsx`

- Full-viewport `fixed` frame with `iframe` to the external marketing site.
- `body { overflow: hidden }` while mounted (restored on unmount) to reduce overscroll/bounce.
- **LLM note:** Do not add `AppShell` here. Do not assume scroll context matches inner pages.

### 15.2 Login & signup

**File:** `src/app/login/page.tsx`

- **Layout:** Mobile: collage + gradient + tagline; desktop: `lg:w-1/3` form + `lg:w-2/3` image marquee. Shared `min-h-screen` / `lg:h-screen`, `bg-[#121212]`.
- **Form card:** `rounded-[40px]` (mobile) with `bg-black/40 backdrop-blur-xl border border-[rgba(48,48,48,1)]`; desktop flattens to transparent.
- **Auth input recipe (`inputCls`):** `rounded-[20px] border border-[rgba(48,48,48,1)] bg-black`, `focus:border-[#ff5b00]/50 focus:ring-4 focus:ring-[#ff5b00]/5`, `placeholder` mid-gray.
- **Labels:** `text-[12px] font-bold text-[#a3a3a3] uppercase tracking-[0.18em]`.
- **Primary submit:** Full-width `rounded-full` orange CTA, `h-[64px]` mobile / `h-[52px]` desktop, `font-black uppercase tracking-[2px]`, `hover:scale-[1.02] active:scale-[0.98]`, custom shadow.
- **Google CTA:** White filled pill, same size rhythm as primary.
- **Inline `<style>`:** Custom `@keyframes` for horizontal marquee and `fadeUp` — rare pattern; if animating new auth elements, consider Tailwind `animate-in` first for consistency.
- **Skeleton:** `LoginSkeleton` uses `bg-[#1e1e1e]` blocks on `bg-[#121212]` — different gray than `bg-white/5` used in `loading.tsx` (acceptable variance between auth and authed).

### 15.3 Forgot password

**File:** `src/app/forgot-password/page.tsx`

- Reuses **OTP** boxes: `rounded-2xl` cells, `font-mono`, `focus:border-[#ff5b00]/60 focus:ring-4 focus:ring-[#ff5b00]/10`.
- Text inputs use a shared `inputCls` (similar border token `rgba(48,48,48,1)` as login).

### 15.4 Email verification (OTP)

**File:** `src/app/verify-email/page.tsx`

- Six-digit OTP UI aligned with forgot-password (same interaction model: paste, backspace, focus chain).

### 15.5 Onboarding

**File:** `src/app/onboarding/page.tsx`

- Imports `react-phone-number-input/style.css` plus global classes `.phone-input-dark` / `phone-input-dark-lg` from `globals.css` for the phone field.
- Validation copy uses uppercase small type patterns consistent with settings (`text-red-500`, `text-[10px] font-black` where applicable — match file).

### 15.6 Legal: Terms & Privacy

**Files:** `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`

- `min-h-screen bg-[#121212]`, `max-w-3xl mx-auto px-6 py-16 md:py-20`.
- “Back to Login” link: `text-[#666] hover:text-[#ff5b00]`, `uppercase tracking-widest`.
- H1: `font-display font-black`, accent words in `text-[#ff5b00]`.
- Section titles: `text-[12px] font-black uppercase tracking-[3px] text-[#ff5b00]`.
- Body: `text-[#ccc] leading-[1.8]` for longform readability (slightly lighter than pure white to reduce eye strain on dense legal copy).

### 15.7 Help center

**File:** `src/app/help/page.tsx`

- Uses shared `Button`, `Card`, `cn`, FAQ-style sections; visually aligned with customer app (not admin zinc). Match existing accordion/spacing in file when adding questions.

### 15.8 Social composer & public gallery (large feature pages)

- **`/social` —** `src/app/social/page.tsx` is a long, state-heavy UI (format cards, upload, regeneration, downloads). It follows the **customer** orange/dark system (`Button`, dark cards, orange CTAs). When extending it, **copy patterns from the same file** (grid cards, status rows, `Loader2` usage) rather than introducing admin-style zinc.
- **`/gallery` —** `src/app/gallery/page.tsx` for browse/public gallery; uses `AppShell` padding — align card grids and modals with **history** / **tutorials** card shells (`rounded-[32px]`, `border-[#1a1a1a]`, orange hover) unless the file already defines a different treatment.

---

## 16. Loading states (route-level)

**Pattern files:** e.g. `src/app/dashboard/loading.tsx`, `src/app/generate/loading.tsx`, `src/app/history/loading.tsx`, `src/app/gallery/loading.tsx`, `src/app/social/loading.tsx`, `src/app/subscription/loading.tsx`, `src/app/settings/loading.tsx`

- **Structure:** `animate-pulse` + `bg-white/5` (or similar) **rounded** blocks; vertical `space-y-*` matching target page layout.
- **LLM note:** Shapes should **mirror** the final page (hero, banner height, row count) so the transition is low-jitter. Do not use multi-color spinners in route loaders unless product asks — static pulse matches the app.

---

## 17. Overlays, z-index, and portals

### 17.1 Stacking (approximate; always verify in file)

| Z-index | Example |
| --- | --- |
| `z-40` | Mobile sticky header (`Navbar`) |
| `z-50` | Desktop sidebar |
| `z-[55]` | Top notification strip (non-blocking `pointer-events`) in `AppShell` |
| `z-[100]` | User popover menu in sidebar |
| `z-[200]` | `ImageLightbox` backdrop; `NotificationPanel` full-screen scrim + drawer |
| `z-[300]` | `RegenConfirmDialog` |
| `z-[500]` | `DownloadToastPanel` when positioned in lightbox stack |

`createPortal(..., document.body)` is used for `ImageLightbox`, `RegenConfirmDialog`, and the portalized download toast so overlays sit above `AppShell`.

### 17.2 Modal / drawer conventions

- **Backdrop:** `bg-black/60`–`bg-black/80` + `backdrop-blur-sm` or `backdrop-blur-xl` depending on context.
- **Scrim click:** Closes on backdrop click for lightbox; notification panel has explicit close targets.
- **Dialog surface:** `bg-[#0d0d0d]` / `bg-[#111]`, `border border-[#1a1a1a]` or `border-white/5`, large radius (`rounded-[24px]`–`rounded-[40px]`).
- **Safe area:** `env(safe-area-inset-bottom)` used in `ImageLightbox` for toast position — preserve on notched devices when adding bottom-fixed UI.

---

## 18. Extended component behaviors

| Piece | File | Notes |
| --- | --- | --- |
| `DownloadToast` / `useDownloadToast` / `DownloadToastPanel` | `src/components/ui/DownloadToast.tsx` | Phases: **downloading** (orange border/spinner), **done** (emerald), **error** (red). `role="status"`, `aria-live="polite"`. Rounded: pill on desktop, `rounded-3xl` column on small breakpoints. |
| `ImageWithLoader` | `src/components/ui/ImageWithLoader.tsx` | Wraps `RetryImage`; orange `Loader2` on `bg-black/40` until loaded. |
| `RetryImage` | `src/components/ui/RetryImage.tsx` | Retry-on-error path for CORS or transient image failures — preserve when swapping image primitives. |
| `ImageLightbox` | `src/components/generation/ImageLightbox.tsx` | Fullscreen viewer; nav chevrons; `DownloadToastPanel` position; CTA bar uses `Button` + regen. |
| `RegenConfirmDialog` | `src/components/generation/RegenConfirmDialog.tsx` | Confirm modal with credit callout in orange-tinted box. |
| `ExpandedPanel` | `src/components/generation/ExpandedPanel.tsx` | Generate/dashboard expansion — follow existing animation classes in file. |
| `NotificationBellProvider` / `NotificationBellButton` / panel | `src/components/layout/NotificationBell.tsx` | Unread badge: orange `rounded-full` count. Items: title `text-[#ff5b00]`, body `text-[#ccc]`, unread row `bg-[#ff5b00]/5 border-[#ff5b00]/15`. |
| `FreeCreditsClaimCard` | `src/components/promo/FreeCreditsClaimCard.tsx` | `sidebar` vs `banner` variants; orange gradient fringes, `font-display` titles, `claim` flow may `alert()` + router — preserve UX if touching. |
| `ActiveDiscountPromoBanner` | `src/components/promo/ActiveDiscountPromoBanner.tsx` | Check file for current promo treatments on subscription/dashboard. |
| `MultiUserSelect` | `src/components/admin/MultiUserSelect.tsx` | **Admin:** zinc chips, `focus:border-fuchsia-500/40`, dropdown `bg-zinc-900`, fuchsia “Added” hint. Same **admin** language as `FilterSelect`. |

---

## 19. Iconography and micro-interactions

- **Library:** `lucide-react` only (no mixed icon sets on the same bar unless necessary).
- **Nav icons:** ~`h-[18px] w-[18px]` in primary customer nav; **stroke** icons with `strokeWidth` 2–2.5 on header actions (`NotificationBellButton`, mobile help).
- **Active state:** Customer nav tints icon **black** on orange background; inactive uses gray → orange on **group-hover** where applicable.
- **Loading:** `Loader2` + `animate-spin` for async operations; `animate-ping` for live status dots (`StatusBadge`, role indicator on settings).
- **Chevrons / disclosure:** `ChevronDown`, `ChevronRight` per existing pages — match rotation/circle treatment from the page you copy.

---

## 20. LLM anti-patterns (full list)

Expand on §13.4 — treat as **errors** to avoid when generating new UI.

| Pitfall | Detail |
| --- | --- |
| **Shadcn / default Tailwind tokens** | The project is **not** shadcn-ui. `bg-primary`, `text-muted-foreground`, `text-primary-foreground` are **not** defined in `tailwind.config.ts` and will not compile to brand styles. Use `bg-accent`, `text-white/60`, `bg-[#ff5b00] text-black`, or add tokens in config first. (Global `error.tsx` was updated to use real classes.) |
| **Collapsing admin + customer** | Do not recolor **admin** filters (fuchsia/zinc) to **orange** “for brand.” |
| **Success = orange** | **Emerald** marks success in `StatusBadge`, many tables, and download “done” — orange is CTA/brand, not completion. |
| **Ignoring `AppShell` width** | Main column already applies `max-w-[1400px]` and `lg:pr-[5.5rem]`. Nesting a second `max-w` or full-bleed wrapper without reason breaks alignment with the notification strip. |
| **Bell overlay** | The fixed top bar uses `pointer-events-none` with `pointer-events-auto` only on the bell — do not set `pointer-events` on a parent in a way that blocks page clicks (see `AppShell` history / bug fix pattern). |
| **Portal without body mount** | Overlays that must cover the shell should use `createPortal(…, document.body)` (see lightbox / regen). Inconsistent stacking causes “modal under sidebar” bugs. |
| **Arbitrary z-index** | Reuse the established bands in §17.1. Random `z-9999` fights existing drawers. |
| **Lightbox & downloads** | When changing `ImageLightbox`, preserve `DownloadToastPanel` position and `ImageWithLoader` to avoid image flash. |
| **Form field drift** | Auth pages share `border-[rgba(48,48,48,1)]` and orange focus; settings use softer `white/5` borders — do not merge recipes across surfaces without a deliberate unification pass. |
| **OTP / phone** | Keep OTP `inputMode="numeric"`, paste handling, and phone CSS classes in sync across verify/forgot/settings. |
| **Home iframe** | Do not add scroll-dependent layouts on `/` without accounting for `body` overflow changes. |
| **Accessibility** | When adding new interactive controls, follow existing `aria-label`, `role="dialog"`, `aria-modal`, `aria-live` patterns from `NotificationPanel`, toasts, and modals. |
| **Currency & dates** | User-facing money uses **INR** and `formatPrice`; timestamps often `formatDate` **en-IN** — do not hardcode USD or US date order without an explicit i18n task. |
| **Tailwind `content`** | New folders outside `src/app`, `src/components`, `src/pages` will **not** generate utilities if not added to `tailwind.config.ts` `content` array. |

---

## 21. Full frontend route & component index

Use this as a **checklist** when claiming “full front-end” coverage. Update when adding routes.

**App routes (representative):**  
`/`, `/login`, `/forgot-password`, `/verify-email`, `/onboarding`, `/terms`, `/privacy`,  
`/dashboard`, `/generate`, `/tutorials`, `/social`, `/gallery`, `/history`, `/subscription`, `/settings`, `/help`,  
`/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/credits`, `/admin/generations`, `/admin/gallery`, `/admin/payments`, `/admin/notifications`, `/admin/emails`, `/admin/dead-letters`, `/admin/settings`, `/admin/providers`, `/admin/team`

**UI barrel (`@/components/ui`):** `Card`, `Button`, `StatusBadge`, `FilterSelect`, `ActivityRow` (+ skeleton, thumbnails), `LoadMoreButton`, `DownloadToast` (+ `useDownloadToast`, panel), `RetryImage`, `ImageWithLoader`

**Layout & shell:** `AppShell`, `Navbar`, `NotificationBell*`

**Feature folders:** `src/components/generation/*`, `src/components/promo/*`, `src/components/admin/*`, `src/components/providers/*`

**Data:** `src/data/tutorials.ts` drives tutorials metadata.

---

## 22. Document maintenance

- **When** merging significant UI work, update: **nav routes**, new shared components, and any **new visual language** (e.g. a second filter style) under **Section 2** and **Section 6**.
- **Version** by changing **Last updated** at the top and, if needed, a one-line note in git commit message: `docs(frontend): sync JewelAI_Design_System.md with …`
- **Onboarding new surfaces:** add a row to **§21** and a short recipe under **§15** or **§7** as appropriate.

This file is the **single** place for cross-cutting UI rules; avoid duplicating long token lists in README unless linking here.
