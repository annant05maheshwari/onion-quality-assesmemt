# Onion Quality Passport — Working Prototype

A working, runnable version of the SIH26031 demo. No build step, no
backend — open it in a browser and it works.

## How to run in VS Code

1. Open this folder in VS Code
2. Install the **Live Server** extension (if you don't have it)
3. Right-click `index.html` → **Open with Live Server**

(Or just double-click `index.html` to open it directly in a browser —
everything runs client-side.)

## What actually works right now

- **Upload a photo** → it's drawn to canvas → analysed pixel-by-pixel
  (darkness ratio, colour variance, rough size-in-frame estimate) →
  gets a score (0–100), a grade (A/B/C/Reject), and a plain-English
  explanation
- **Officer grade dropdown** — enter a manual grade alongside the AI's,
  and the Second Opinion check flags real mismatches
- **Dashboard** — every graded lot (including 3 seeded sample rows)
  shows up in the table automatically
- **Dispute Replay** — click any row to reopen that lot's photo, score,
  defects and timestamp in a modal

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure — hero, upload demo, dashboard, replay modal |
| `style.css` | Onion-derived colour palette and all layout/styling |
| `script.js` | All logic: image analysis, grading, dashboard, modal |

## What's still a placeholder (be upfront about this to judges)

- Grading is **heuristic** (hand-written rules), not a trained model —
  see the `analyzeImageData()` function in `script.js` for the exact
  logic and its `TODO` comments
- Size estimation is a rough bounding-box guess, not real contour
  detection — swapping in OpenCV.js is the natural next step
- The 3 seeded dashboard rows use generated colour-circle thumbnails,
  not real onion photos — replace `seedRows()`'s calls with your own
  real sample photos if you want the replay modal to show actual onions

## Quick calibration tip

If real onion photos are grading too harshly or too leniently, adjust
the thresholds in `analyzeImageData()`:
- `brightness < 70` — what counts as a "dark/rot" pixel
- `darkRatio > 0.15` / `> 0.05` — thresholds for defect flags
- `stdDev > 55` — blotchiness/uneven-tone threshold
- `score -= darkRatio * 150` — how harshly rot affects the score

Test with 8–10 real photos (mix of good and bad) and tune these until
the grades look right before the live demo.
