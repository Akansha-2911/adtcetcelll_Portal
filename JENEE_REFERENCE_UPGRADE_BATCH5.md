# SPVN CET Portal — Jenee Reference Upgrade Batch 5

## Scope
Student exam experience upgrade based on the supplied Jenee CET UI references while preserving the existing SPVN Express/MongoDB exam flow.

## Completed

### 1. CET-style exam workspace
- Cleaner full-screen exam shell.
- Persistent test title, roll number, timer and violation counter.
- Question number, subject, topic, difficulty and marks remain visible.
- Question image and option image support preserved.

### 2. Subject / section switching
- Added visible section tabs for CET section-flow exams.
- Current section is highlighted.
- Locked sections are visibly disabled.
- Clicking an unlocked section opens its first question after saving the current answer.
- Existing Physics/Chemistry visit rule and Mathematics/Biology unlock logic remains enforced by the backend.

### 3. Question palette states
- Answered.
- Not answered.
- Marked for review.
- Answered + marked.
- Not visited.
- Locked section state.
- Current question receives stronger focus styling.
- Mobile palette button and slide-in palette support added/fixed.

### 4. Autosave / retry feedback
- Added visible `Saving`, `Saved`, `Offline · queued`, and `Retry queued` status indicator.
- Existing offline answer queue integration is preserved.
- Prev/Next/section navigation waits for answer save before leaving the question.

### 5. Timer improvements
- Existing exam countdown and auto-submit retained.
- `No Time Limit` tests now display `No Limit` rather than rendering an artificial huge countdown.
- Urgent timer visual warning remains active for timed tests.

### 6. Review and submission flow
- Existing review modal preserved with answered/unanswered/marked summary.
- Manual submit confirmation remains protected against accidental submission.
- Timer expiry continues to auto-submit.
- Hidden-immediate-result rules remain handled by the backend.

### 7. Faster keyboard workflow
- `1` / `2` / `3` / `4` selects options A / B / C / D.
- `C` clears the current answer.
- `M` toggles Mark for Review.
- Shortcuts are ignored while typing in form controls.

### 8. Anti-cheat compatibility
- Existing tab-switch, focus-loss and fullscreen-exit reporting retained.
- Existing violation thresholds and optional auto-submit behavior are unchanged.

## Files updated
- `views/exam/question.ejs`

## Existing backend used without breaking schema
- `controllers/examController.js`
- `routes/exam.js`
- `models/Result.js`
- `models/Test.js`

## Validation performed
- Node syntax validation passed for exam controller, exam routes, Result model and Test model.
- EJS opening/closing tag count validated for exam question, result and instructions views.
