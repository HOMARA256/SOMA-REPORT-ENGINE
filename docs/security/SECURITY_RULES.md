# SOMA REPORT ENGINE Security Rules

1. Every school-owned record must be tenant scoped.
2. Authorization must be enforced by the server.
3. Never trust school_id supplied by the browser.
4. Never expose privileged credentials to frontend code.
5. Published reports must preserve immutable history.
6. Sensitive actions must be auditable.
7. Cross-school access must have automated negative tests.
8. Environment secrets must never be committed.
9. Platform administration and school administration are separate authorization domains; Platform Admin has no automatic school membership or academic-data access.
10. Subscription suspension preserves school academic records, and exceptional support access requires an explicit, time-limited, audited procedure.
