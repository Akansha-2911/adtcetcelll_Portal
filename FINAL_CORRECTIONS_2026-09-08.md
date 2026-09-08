# SPVN CET Portal — Final Corrections (2026-09-08)

## Database / startup
- `collegeShort` now has a safe fallback in the shared head partial, so the error page can render even before normal locals are attached.
- Development sessions use the in-memory session store by default, avoiding a second `connect-mongo` error during Atlas/DNS outages.
- MongoDB connections prefer IPv4 and retry `MONGO_FALLBACK_URI` (`mongodb://127.0.0.1:27017/spvn_test`) in development when Atlas/DNS fails.
- Development preflight reports external MongoDB reachability as a warning instead of failing static verification.
- The HTTP server remains available in development even if database boot fails, so health endpoints and the diagnostic error page remain reachable.

## Math / Physics / Chemistry / diagrams
- Shared KaTeX renderer remains enabled across admin, student, practice and exam pages.
- Upload-test extraction now preserves valid LaTeX delimiters and structure instead of flattening fractions, roots, powers and subscripts.
- Upload-test AI instructions explicitly require valid LaTeX for mathematical/scientific expressions and chemistry formulas/reactions.
- Upload review shows rendered math only while keeping source values hidden for form submission.
- Marking Scheme options use the same `math-content` renderer as question text.
- Question Bank, Practice Attempt, Practice Result, Exam Question and Exam Result are included in the math-render verification check.

Examples validated by the formatter:
- `\\sim p \\land \\sim q \\lor \\sim r` → `~p ∧ ~q ∨ ~r`
- `\\sqrt{-9}` → `√(−9)`
- `\\frac{1}{2}mv^2` → `1/2mv²`
- `H_2SO_4` → `H₂SO₄`
- `CaCO_3 \\to CaO + CO_2` → `CaCO₃ → CaO + CO₂`

## Tests / shuffling
- Test start order is generated section-wise using `utils/cetExam.js`.
- When shuffle is enabled, questions shuffle only within their own subject section; Physics/Chemistry/Mathematics/Biology are not mixed together.
- Verification now includes a section-wise shuffle smoke test.
- Admin labels clarify that shuffle operates within each section.

## Student Practice
- Practice builder retains Subject → Topic → Subtopic → Difficulty → Question Count flow.
- Added a clearer 3-step UI strip for Subject, Syllabus and Start Practice.
- Practice question and result pages use math rendering for questions/options.

## Student Information
The supplied demo workbook format is supported, including:
- Roll.No.
- CET Exam No.
- G.R. No.
- Students Name
- Student Aadhaar No.
- Address / Taluka / District / Pin code
- Two Parent Mobile columns
- Gender / Hostel / Date of Birth / Category / Blood Group
- Subject group / Academy
- Division labels `Div-A` through `Div-E`

The parser was checked against the supplied demo and detects 440 student rows:
- A: 120
- B: 92
- C: 99
- D: 103
- E: 26

A copy of the supplied demo is included at `samples/SPVN_student_information_demo.xlsx`.

## Verification
Run:

```bash
npm install
npm run check:all
npm run dev
```

Static verification result when packaged: **11/11 checks passed**.

> If Atlas DNS is still unavailable on your machine, the code cannot create an internet connection by itself. Check the `MONGO_URI`, Atlas cluster/network access, and your Windows DNS/internet connection. For local development, install/start MongoDB locally and the included fallback URI will be used.
