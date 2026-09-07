# SPVN CET Portal — Final Workflow Pass

Implemented in this final package:

- Test Builder now allows one subject paper or multiple subject papers.
- All new tests remain Draft-first until manual publishing.
- Question Bank test creation now continues to the Marking Template.
- Upload Test flow: PDF upload -> extraction -> review -> test details -> Draft -> Marking Template -> review/batch -> publish.
- Smart Scan flow: upload question paper/solution -> scan -> review -> save questions -> Draft -> Marking Template. Direct auto-publish removed.
- Question Bank now has a prominent Upload Questions entry point to Smart Scan.
- Marking Template uses per-question positive, negative, partial, bonus marks, subtype and answer key.
- One Question Per Page extractor uses local PDF text first for speed and Vision only when needed.
- Visual-cue pages (circuit/graph/diagram/setup/etc.) automatically use Vision; if Vision is unavailable, the full original visual page is preserved as fallback so diagrams are not lost.
- Upload Test uses one question per PDF page only.
- Darker text and improved contrast on white backgrounds.
- Blue, green and golden UI accents added across the shared front end.
- Missing Content Management route/view restored.

Validation performed:
- `npm run verify`: 9/9 static checks passed.
- All EJS views compiled successfully.
- JavaScript syntax checks passed for modified controllers/routes/extractor.
- Runtime MongoDB network preflight was attempted but this environment cannot resolve/reach the configured Atlas SRV host; this is an external network check and not a source-code verification failure.
