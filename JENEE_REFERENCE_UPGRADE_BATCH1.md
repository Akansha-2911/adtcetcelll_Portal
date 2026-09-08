# SPVN CET Portal — Jenee Reference Upgrade (Batch 1)

Implemented from the 13 supplied UI reference photos while preserving SPVN branding and existing backend flows.

## Completed in this batch

1. **Test Management navigation shell**
   - Organization / Test Management / Reports / Analytics / Monitor / Content top navigation.
   - Secondary workflow tabs: Question Paper / Online Test / Question Paper Setup / Upload Questions.

2. **Question Paper management**
   - Jenee-style table layout.
   - Course and subject filters.
   - Client-side quick search.
   - View / Edit / Delete / Publish actions.
   - Question count, chapter/topic, subject and created date columns.

3. **Online Test view**
   - `/admin/tests?view=online`
   - Shows publish state, schedule, duration, assigned batches and question count.

4. **Question Paper Setup**
   - Existing SPVN create-test engine retained.
   - New Test Management header/tabs and reference-inspired presentation.
   - Existing Course → Subject → Unit → Subtopic → Question selection workflow remains connected to database APIs.

5. **Upload Questions / Smart Scan**
   - Integrated into the new Test Management tab flow.
   - Existing multi-file AI scan/review pipeline retained.
   - UI adjusted to match the clean document-upload workflow visible in the reference.

## Backend compatibility

- Existing Express routes retained.
- Existing MongoDB schemas retained.
- Existing tests, question bank, smart scan and groups/batches data remain compatible.
- `getTests` now accepts `view=online` for the Online Test screen.

## Next batch recommended

- Marking Template per-question positive/negative/partial/bonus marks.
- Assign Test to Batches modal.
- Organization Details + Batches screen redesign.
- Publish scheduling + test password + hide immediate result controls.
