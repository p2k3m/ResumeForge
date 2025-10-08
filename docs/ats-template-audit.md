# ATS Template Audit

The audit reviews each template in `templates/` for stylistic complexity, spacing, font choices, section structure, and header formatting that influence applicant tracking system (ATS) readability.

## Resume Templates

### `ats.html`
- **Style & layout:** Single-column layout with minimal styling and subtle border/shadow keeps parsing simple.【F:templates/ats.html†L9-L29】【F:templates/ats.html†L111-L128】
- **Spacing:** Consistent vertical rhythm using 22px section spacing and 12px heading margin maintains clarity without crowding.【F:templates/ats.html†L47-L58】
- **Fonts:** Relies on Source Sans 3 with system fallbacks; sans-serif stack is ATS safe despite Google Fonts import.【F:templates/ats.html†L7-L14】
- **Sections & headers:** Semantic headings and bullet lists follow ATS best practices.【F:templates/ats.html†L51-L127】
- **Compliance assessment:** ✅ **ATS-ready.** Only recommendation is to ensure external font import does not fail offline.

### `2025.html` / `2025.css`
- **Style & layout:** Uses pill badges, gradients, and responsive two-column grid that can confuse parsers and waste keyword density.【F:templates/2025.html†L16-L45】【F:templates/2025.css†L19-L134】
- **Spacing:** Generous padding and large border radii create whitespace but rely on layered pseudo-elements that may hide text in PDF exports.【F:templates/2025.css†L24-L133】
- **Fonts:** Custom Inter font is acceptable with fallbacks; however, reliance on Google Fonts import introduces failure risk if blocked.【F:templates/2025.css†L1-L21】
- **Sections & headers:** Sections render inside decorative cards with optional bullets rendered as symbols, which some ATS tools strip.【F:templates/2025.html†L24-L45】【F:templates/2025.css†L140-L196】
- **Compliance assessment:** ⚠️ **High design complexity; not ATS friendly.** Recommend simplifying to single column, removing pills/gradients, and using plain bullet markers.

### `classic.html`
- **Style & layout:** Decorative crest/QR containers, gradients, and serif typography skew toward print design.【F:templates/classic.html†L58-L129】
- **Spacing:** Generous padding aids readability but vertical rules and pseudo-elements add non-textual artifacts.【F:templates/classic.html†L136-L186】
- **Fonts:** Playfair Display and Source Serif imports may not load in ATS-safe PDF; fallback to standard serif suggested.【F:templates/classic.html†L7-L25】
- **Sections & headers:** Uppercase headings with decorative bullets remain readable, yet QR/image slots risk parser misinterpretation.【F:templates/classic.html†L65-L124】【F:templates/classic.html†L188-L199】
- **Compliance assessment:** ⚠️ **Moderate ATS risk** due to imagery placeholders and ornate styling.

### `minimalist.html` *(retired; archived under `templates/retired/`)*
- **Style & layout:** Clean card with light borders; switches to two-column layout on large screens which may break reading order when exported.【F:templates/retired/minimalist.html†L61-L148】
- **Spacing:** Consistent clamp-based spacing supports readability.【F:templates/retired/minimalist.html†L24-L70】
- **Fonts:** Work Sans import is legible but consider system defaults to avoid external dependency.【F:templates/retired/minimalist.html†L7-L28】
- **Sections & headers:** Uppercase headings and simple bullets are ATS safe; contact/skills lists remove bullets for clarity.【F:templates/retired/minimalist.html†L71-L181】
- **Compliance assessment:** ⚠️ **Generally ATS-compatible**, but ensure exports flatten to single column and consider removing custom bullets.

### `modern.html`
- **Style & layout:** Neon gradients, dark background, and card hover states add heavy visuals that frequently fail ATS parsing, especially due to two-column grid.【F:templates/modern.html†L25-L174】
- **Spacing:** Adequate spacing but reliant on decorative overlays that can obscure text in conversions.【F:templates/modern.html†L36-L135】
- **Fonts:** Inter import is readable; fallback exists but color contrast (light text on dark background) may degrade in ATS.【F:templates/modern.html†L7-L34】
- **Sections & headers:** Uses custom markers and icon boxes that some parsers ignore, risking content loss.【F:templates/modern.html†L95-L195】
- **Compliance assessment:** ❌ **Not ATS-friendly**; needs simplification to light background, single column, and standard bullets.

### `professional.html`
- **Style & layout:** Carded sections with gradients and two-column desktop grid introduce parsing risk.【F:templates/professional.html†L32-L152】
- **Spacing:** Structured gaps and padding are clear but rely on decorative pseudo-elements.【F:templates/professional.html†L32-L127】
- **Fonts:** Source Sans Pro is ATS-safe; still uses Google Fonts import.【F:templates/professional.html†L7-L29】
- **Sections & headers:** Semantic headings and list items, yet circular markers may be ignored.【F:templates/professional.html†L108-L199】
- **Compliance assessment:** ⚠️ **Moderate ATS risk** from two-column layout and decorative markers.

### `structured.html` *(retired; archived under `templates/retired/`)*
- **Style & layout:** Gradient-backed cards and two-column responsive grid add complexity beyond ATS-safe design.【F:templates/retired/structured.html†L54-L178】
- **Spacing:** Uses consistent clamp spacing but adds hover overlays and pseudo-elements.【F:templates/retired/structured.html†L59-L102】
- **Fonts:** IBM Plex Sans import is modern but non-standard; ensure fallbacks are acceptable.【F:templates/retired/structured.html†L7-L18】
- **Sections & headers:** Section bullets rely on pseudo-elements; contact/skills remove them for clarity.【F:templates/retired/structured.html†L85-L160】
- **Compliance assessment:** ⚠️ **Moderate ATS risk**; consider simplifying styling and fixing to one column.

### `precision.html` *(retired; archived under `templates/retired/`)*
- **Style & layout:** Gradient header, card outlines, and two-column responsive grid increase parsing difficulty.【F:templates/retired/precision.html†L31-L166】
- **Spacing:** Generous padding but uses decorative side rules via pseudo-elements.【F:templates/retired/precision.html†L71-L125】
- **Fonts:** Inter import with system fallbacks; still reliant on external font load.【F:templates/retired/precision.html†L7-L28】
- **Sections & headers:** Pseudo-element bullets and uppercase headings remain readable yet may be stripped by ATS.【F:templates/retired/precision.html†L89-L147】
- **Compliance assessment:** ⚠️ **Moderate ATS risk** from decorative framing and multi-column layout.

### `portal.html` *(retired; archived under `templates/retired/`)*
- **Style & layout:** Portal interface uses dark glassmorphism, not meant for ATS export; design is heavy but acceptable as UI.【F:templates/retired/portal.html†L12-L180】
- **Spacing & fonts:** Inter/system stack with responsive spacing suits web use.【F:templates/retired/portal.html†L8-L139】
- **Sections & header:** Form labels and headings are semantic; ATS compliance not applicable because it is not a resume template.【F:templates/retired/portal.html†L183-L199】
- **Compliance assessment:** ℹ️ **Out of scope** for ATS parsing but ensure contrast for accessibility if exporting content.

## Cover Letter Templates

### `cover_modern.html`
- **Style & layout:** Simple single-column body with standard margins and teal accent header text.【F:templates/cover_modern.html†L6-L19】
- **Fonts:** Uses Segoe UI/Tahoma stack—ATS safe.【F:templates/cover_modern.html†L7-L8】
- **Compliance assessment:** ✅ **ATS-friendly** (plain text styling).

### `cover_2025.html`
- **Style & layout:** Dark background with bright accent header may create contrast issues in parsing/export.【F:templates/cover_2025.html†L6-L19】
- **Fonts:** Inter stack is fine, but uppercase neon header feels decorative.【F:templates/cover_2025.html†L7-L9】
- **Compliance assessment:** ⚠️ **Moderate risk**; recommend light background and standard header formatting.

### `cover_classic.html`
- **Style & layout:** Centered uppercase header and serif body mimic traditional letter; ATS can parse but center alignment may reduce readability.【F:templates/cover_classic.html†L6-L19】
- **Fonts:** Times New Roman is ATS safe.【F:templates/cover_classic.html†L7-L9】
- **Compliance assessment:** ✅ **Generally ATS-compatible**; consider left-aligning heading.

### `cover_professional.html`
- **Style & layout:** Clean sans-serif layout with standard spacing and blue header text.【F:templates/cover_professional.html†L6-L19】
- **Fonts:** Helvetica/Arial stack is ATS safe.【F:templates/cover_professional.html†L7-L8】
- **Compliance assessment:** ✅ **ATS-friendly.**

### `cover_ats.html`
- **Style & layout:** Plain Arial layout with uppercase header and consistent spacing.【F:templates/cover_ats.html†L6-L19】
- **Fonts:** Relies on system-safe Arial stack.【F:templates/cover_ats.html†L7-L8】
- **Compliance assessment:** ✅ **ATS-ready.**

## Summary Recommendations
- Prioritize `ats.html` as the go-to compliant resume template; extend its styling guidance to other designs.
- For multi-column resumes (`2025`, `minimalist`, `modern`, `professional`, `structured`, `precision`), provide an alternative single-column export or simplify CSS for ATS versions.
- Reduce reliance on external font imports where possible, substituting with system stacks to avoid loading failures.
- Remove or offer toggles for decorative imagery, gradients, and pseudo-element bullets that risk being dropped during parsing.
