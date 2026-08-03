# Security Review — NWP (Network Hospital Programme)

**Date:** 2026-07-31
**Scope:** Full repository, primary focus on API security
**Reviewer:** Claude Code

## Summary

A full-repository security review was performed, focused on whitelisted API
endpoints, permission enforcement, and the public-facing dashboard. Five
issues were found and fixed. A second, independent full-repo pass afterward
found no remaining issues.

---

## Issues found & fixed

### 1. Broken access control / CSRF — `get_location_from_pincode` API

**File:** `nwp/nwp/doctype/patient_registration/patient_registration.py`

**Problem:** The endpoint was whitelisted with no role or HTTP-method
restriction, and created `State List` / `District List` records via
`ignore_permissions=True`. Any logged-in user (any role) could call it — even
via a plain GET request, meaning it could be triggered blindly via CSRF (e.g.
an `<img>` tag on an external site) — to create records in doctypes they had
no permission on.

**Fix:** Restricted to `methods=["POST"]` (restores CSRF-token enforcement)
and added a `frappe.has_permission("Patient Registration", "create")` check
before doing anything. Also wrapped the external pincode-lookup HTTP call in
a try/except so network failures return a clean message instead of an
unhandled traceback.

### 2. Stored XSS in the Network Hospital dashboard

**File:** `nwp/www/network-hospital.html`

**Problem:** Patient/claim/budget fields (comment, justification, donor name,
doctor name, etc.) were concatenated unescaped into HTML and rendered via
`innerHTML` and `document.write`. Anyone able to write those fields could
plant a script/`onerror` payload that would execute in the browser of anyone
viewing the dashboard — enabling session/cookie theft.

**Fix:** Added an `escHtml()` helper and routed both `dv()`
display-formatting functions through it, so every field is now HTML-escaped
before being inserted into markup.

### 3. Public dashboard page with no login requirement

**File:** `nwp/www/network-hospital.py`

**Problem:** The page had no `get_context()` guest check, so it was
reachable by anyone unauthenticated (Frappe `www` pages are public by
default). Data calls already returned 403 for non-System-Managers, but the
page shell itself was an unnecessary exposure.

**Fix:** Added `get_context()` that throws `PermissionError` for `Guest`.

### 4. Patient PII/financial data stored in URL fragments

**File:** `nwp/www/network-hospital.html`

**Problem:** `drill()` and `openDet()` base64-encoded entire patient claim
records into the URL hash (`#drill=...`, `#claim=...`) when opening detail
tabs — landing sensitive data in browser history.

**Fix:** Data is now stored in `sessionStorage`; only a short opaque id
travels in the URL.

> Trade-off: a bookmarked/reloaded link from a different browser session now
> falls back to the main dashboard instead of restoring the old data — this
> is intentional, to avoid leaking PHI via the URL.

### 5. Missing Subresource Integrity on a CDN script

**File:** `nwp/www/network-hospital.html`

**Problem:** `xlsx.full.min.js` loaded from cdnjs (both the static
`<script>` tag and a dynamically injected one) with no integrity check — a
CDN compromise would be a silent supply-chain XSS.

**Fix:** Added `integrity` (SHA-384, computed from the actual fetched file)
and `crossorigin` to both script tags.

---

## Confirmed clean (no issues, no changes needed)

- No other `@frappe.whitelist()` methods anywhere in the app.
- No other `ignore_permissions` usage.
- No raw `frappe.db.sql` with interpolated/user input (the one `.sql` report
  file is fully static).
- No hardcoded secrets, credentials, or API keys.
- All real doctypes restrict read/write/create to `System Manager`. The four
  doctypes showing empty `permissions: []` (Service List and Percentage,
  Insurance, Departments, Service Log) are child tables (`istable: 1`), which
  is expected — not a permissions gap.

## Left as-is, by choice

- **No rate limiting** on the pincode-lookup endpoint — low severity since
  it's now gated to users with create-permission on Patient Registration.
- **Google Fonts `<link>` has no SRI** — intentional, since Google varies the
  font payload per browser/user-agent and SRI would break it. This is
  standard accepted practice.

## Verification performed

- Python files parse cleanly (`ast.parse`).
- Inline dashboard JS passes `node --check`.
- Two independent full-repo greps/audits (whitelist, ignore_permissions, raw
  SQL, secrets, doctype permissions) turned up nothing beyond the above.
