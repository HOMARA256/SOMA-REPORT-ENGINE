# SOMA REPORT ENGINE action-behaviour matrix

This matrix defines the contract used by interactive controls. The generated
control-level inventory is in `docs/security/INTERACTION_AUDIT.csv`.

| Action | Confirmation / failure behaviour | Rollback | Success destination | Permission / audit | Verification |
|---|---|---|---|---|---|
| Save Draft | Validate the entered fields supported by the record, preserve the form on failure, and show the saved time | Continue editing the saved draft | Stay on the form | Authenticated tenant editor; audit required | A-Level combination UI and RPC path verified |
| Save Changes | Preserve input on failure and provide an actionable error or Retry | Submit a later correction | Stay on the record | Record-specific update permission; audit required | Shared save patterns and TypeScript build verified |
| Create and Close | Prevent duplicate submission while busy; report a specific backend error | Archive/correct after creation | Return to the context-preserving list | Create permission and school ownership | A-Level combination path compiled |
| Save and Continue | Same validation as Create | Archive/correct after creation | Open the next logical setup page | Create permission and school ownership | Contract established; feature-specific destinations remain explicit |
| Cancel / Close / Back | If dirty, show Keep Editing and Discard Changes; otherwise leave immediately | Discard removes browser changes only | Previous logical page | No mutation and no audit | Browser-tested on A-Level combination form |
| Discard Changes | State exactly what is discarded and what saved data remains | Not reversible; saved data is untouched | Intended previous page | No backend mutation | Browser-tested; form values remained after Keep Editing |
| Archive | Show impact and preserved history before confirmation | Timed Undo only where backend eligibility remains; otherwise Restore | Current filtered list | Archive permission; previous/new state audit | Shared confirmation contract available |
| Restore | Explain inactive-parent blockers | Archive again if allowed | Stay on record | Restore permission; audit required | Shared confirmation contract available |
| Delete Permanently | Destructive confirmation, permanent-impact wording, authorized drafts/test data only | None | Draft/test-data list | Elevated delete permission; audit required | Existing delete control uses shared confirmation; dependency errors preserved |
| Activate / Deactivate / Suspend / Reactivate | Show current/new status, affected access, and reason when required | Opposite status action when allowed | Stay on record | Status permission; audit and notifications | Shared confirmation contract available |
| Approve / Reject / Return for Correction | Show affected scope, require policy reason/note, prevent duplicate decision | No Undo for final approval; use correction workflow | Stay on approval page | Delegated approval permission; audit and notification | Existing approval engine and tests retained |
| Publish / Unpublish | Show record count and portal visibility impact | No Undo after external delivery; correction/version flow | Publication summary | Publish permission and approved prerequisite; audit and notification | Existing report publication confirmation retained |
| Retry | Preserve user input and retry only the failed operation | Not applicable | Current page | Same permission checks as original action | Browser-tested context Retry and A-Level error handling |
| Undo | Available only for safe, backend-reversible mutations and must revalidate record version | Real backend reversal | Current list/record | Original mutation permission; reversal audit | Contract established; not shown for final approval/payment/publication |

## Shared UI rules

- `ConfirmDialog` can display current state, next state, changed data, preserved
  data, reversibility, and the post-success destination.
- Busy controls use action-specific progress labels and block duplicate requests.
- Success, information, warning, and error feedback use the common green, blue,
  amber, and red visual states.
- API failures never clear entered values or display a success message.
- The static audit currently inventories 561 controls: 467 functional and 94
  intentionally disabled by permissions, missing prerequisites, or loading state.

