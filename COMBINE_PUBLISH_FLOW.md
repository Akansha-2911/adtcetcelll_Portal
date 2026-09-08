# Final Combine & Publish Flow

- Combine Test accepts 1, 2, or more eligible Draft subject papers.
- Selected papers are merged into one new combined Draft record.
- Duplicate questions are removed.
- Existing per-question marking settings are copied; missing settings fall back to question marks/answers.
- After Combine, the admin is redirected directly to Test Details (`/admin/tests/:id/publish-setup`).
- Test Details collects final title, duration, schedule, batch assignment, instructions, and exam settings.
- Submitting Test Details publishes/schedules the test and can notify assigned students.
- The old "Create Mock Test" wording has been removed from the main draft actions.
- Legacy GET `/admin/tests/:id/publish` now redirects to Test Details instead of showing 404.
