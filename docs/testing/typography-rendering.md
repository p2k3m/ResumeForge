# Typography rendering verification

This document captures the sanity checks we run to confirm that the portal's typography renders with consistent font families, cap heights, and letter spacing across desktop (macOS & Windows) and mobile Safari/Chromium.

## Scope

| Surface | Viewport | Engine | Notes |
| --- | --- | --- | --- |
| Upload & dashboard landing page | 1440×900 | Chromium (macOS, Windows) | Validate Inter Variable family is loaded, headings render at the same cap height, and gradient CTA buttons retain their `font-weight: 600` treatment. |
| Upload & dashboard landing page | 1440×900 | WebKit (macOS Safari) | Confirm `font-synthesis: none` prevents synthetic bold text and the caps labels keep their tracking. |
| Upload & dashboard landing page | 1366×768 | Chromium (Windows) | Compare body copy `line-height` to macOS to spot spacing differences from ClearType. |
| Upload & dashboard landing page | 390×844 | WebKit iOS (Safari) | Ensure the mobile `line-height` bump and tracking reset keep paragraph rhythm readable on small screens. |
| Upload & dashboard landing page | 393×873 | Chromium Android | Verify the same adjustments apply on Chromium-based mobile browsers. |

## How to run the spot checks

1. Start the client locally:

   ```bash
   cd client
   npm install
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

2. Use BrowserStack, Sauce Labs, or local virtual machines to open the app at `http://localhost:5173` with the above viewport presets.
3. Open each browser's developer tools and inspect the `html` element to confirm:
   - `font-family` resolves to `Inter Variable` followed by our cross-platform system fallbacks.
   - `font-optical-sizing` and `font-synthesis` are applied so the weight and italic shapes come from the shipped fonts instead of the system synthesising them.
   - `font-size-adjust` is present (or falls back to `0.525`) to harmonise the fallback fonts on Windows.
4. Inspect the `.caps-label` elements to confirm their letter spacing is `~0.28em` on desktop and resets to `0` on small viewports.
5. On mobile viewports, verify that the computed `line-height` on `<body>` increases from `1.6` to `1.65`.

Record any discrepancies—including screenshots and computed style dumps—in the QA log so we can tune the base typography variables for the affected platform.

## Current findings

- **Chromium (desktop, Linux proxy for Windows):** Fonts load from `@fontsource`, computed `font-family` retains the Inter stack, and the fallback ratio reports as `0.525`, matching the expected Windows adjustment.
- **WebKit (mobile emulation via responsive mode):** The added `font-optical-sizing` and `font-synthesis` flags prevent Safari from synthesising faux bold text; the mobile line-height bump keeps the hero summary from crowding.
- **Action items:** None at this time. If native macOS/Windows devices show cap-height drift, adjust `--caps-letter-spacing` and `font-size-adjust` accordingly.

