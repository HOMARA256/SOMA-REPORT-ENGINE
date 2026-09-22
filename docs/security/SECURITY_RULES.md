# OURSCHOOL Security Rules

1. Every school-owned record must be tenant scoped.
2. Authorization must be enforced by the server.
3. Never trust school_id supplied by the browser.
4. Never expose privileged credentials to frontend code.
5. Published reports must preserve immutable history.
6. Sensitive actions must be auditable.
7. Cross-school access must have automated negative tests.
8. Environment secrets must never be committed.
