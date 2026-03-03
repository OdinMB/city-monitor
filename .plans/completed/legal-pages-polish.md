# Legal Pages Polish

## Changes

### 1. Footer — " / Impressum" suffix
- EN/TR/AR translations: append " / Impressum" to the legal notice link text
- DE already says "Impressum" — no change

### 2. Obfuscated contact info (new component)
- Create `ObfuscatedContact.tsx` with `ObfuscatedEmail` and `ObfuscatedAddress` components
- Store strings reversed, decode at render time to deter scrapers
- Email: contact@citymonitor.app (not .dev)

### 3. ImprintPage
- Use obfuscated components for both address blocks and the email link
- Update email from .dev → .app
- Wrap "Privacy Policy — you will be pleasantly surprised" link in a content box card
- Update page title to "Legal Notice / Impressum"

### 4. PrivacyPage
- Update "Website Analytics" card to describe SimpleAnalytics (privacy-friendly, no cookies, EU-based)
- Add SimpleAnalytics to third-party services table
- Update meta description
- Obfuscate contact email, update to .app

### 5. NoTrackingPage
- Wrap "For details on what data we collect…" paragraph in a content box card
- Light copy updates to reflect SimpleAnalytics (still no user tracking)

### 6. SimpleAnalytics integration
- Add SA script tag to index.html

### Files
- `packages/web/src/components/ObfuscatedContact.tsx` (new)
- `packages/web/src/pages/ImprintPage.tsx`
- `packages/web/src/pages/PrivacyPage.tsx`
- `packages/web/src/pages/NoTrackingPage.tsx`
- `packages/web/src/components/layout/Footer.tsx`
- `packages/web/src/i18n/{en,tr,ar}.json`
- `packages/web/index.html`
