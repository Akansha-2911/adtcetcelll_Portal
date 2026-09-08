# Navigation cleanup

- Removed the separate `Tests` item from the admin sidebar.
- `/admin/tests/workflow` now redirects to `/admin/tests` so there is one Tests entry point.
- Removed the visible `Combine Subject Papers` action from the Tests screen.
- Renamed the main action to `Create Test`.
- Renamed Question Paper wording in the Tests list to simpler Tests wording.
- Renamed legacy Combined Mock Test badge to `Multi-Subject Test`.
- Existing backend combination route/data support remains for backward compatibility, but it is no longer exposed as a separate admin workflow.
