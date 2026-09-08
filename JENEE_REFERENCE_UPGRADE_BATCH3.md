# SPVN CET Portal — Jenee Reference Upgrade Batch 3

Implemented in this batch:

1. **Organization Dashboard**
   - New `/admin/organization` Jenee-style organization details page.
   - Batch table with student totals, course, date range, status, reports and edit action.
   - Organization-level summary cards.

2. **Analytics Module**
   - New `/admin/analytics` page.
   - Filter by test and batch.
   - Attempts, average percentage, pass count and best score summary.
   - Subject-level performance and test-level performance tables/bars.

3. **Live Test Monitor**
   - New `/admin/monitor` page for all published/active tests.
   - Live, submitted and flagged counts.
   - Upcoming/live/ended state calculation.
   - Quick activate/close controls.
   - New `/admin/monitor/:id` candidate monitor with answer count and anti-cheat details.

4. **Online Test Management Enhancements**
   - Online Test actions now include Monitor.
   - Active/Published/Closed/Draft statuses have clearer UI.
   - Activate/Close action added directly to the Online Test list.

5. **Batch Data Model Completion**
   - Group schema now stores `startDate`, `endDate` and `status` fields used by the Batch 2 UI/controller.

6. **Navigation**
   - Jenee-style top navigation now points to real Organization, Analytics and Monitor modules.
   - Sidebar includes Organization, Analytics and Live Monitor.
