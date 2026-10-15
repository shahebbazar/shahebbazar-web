# Legacy Navbar Reference

This file preserves an earlier Shaheb Bazar navigation implementation for historical and contribution evidence.

## Original location:
frontend/shahebbazar/app/components/Navbar.jsx

## Current navigation implementation:
- frontend/shahebbazar/components/shared/SiteHeader.tsx
- frontend/shahebbazar/components/provider/ProviderShell.tsx
- frontend/shahebbazar/components/admin/AdminShell.tsx

## Reason for archiving

The legacy Navbar component is not imported or rendered by the current application.

The component uses an earlier navigation, routing, authentication and styling structure that has now been replaced by the shared public, provider and administrator application shells.

The file is stored with a .txt extension so it remains readable as historical evidence but is excluded from JavaScript compilation, TypeScript validation and ESLint scanning.

"@ | Set-Content `
  "docs\legacy-reference\README.md"