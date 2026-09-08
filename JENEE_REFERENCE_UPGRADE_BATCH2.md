# SPVN CET Portal — Jenee Reference Upgrade Batch 2

Implemented:
- Jenee-style Marking Template with per-question positive, negative, partial, bonus, subtype and answer-key controls.
- Apply-to-all marking controls and question search.
- Web/mobile exam scoring now respects per-question positive/negative marks and overridden answer keys.
- Assign Test to Batches modal with multi-select and student notifications.
- Advanced test settings: test type, pattern, rank scheme, optional password, no-time-limit, hide immediate results, fixed-time flag.
- Batch model expanded with start date, end date and status.
- Organization page receives Jenee-style top navigation.

Key routes:
- GET/POST /admin/tests/:id/marking-template
- POST /admin/tests/:id/assign-batches
