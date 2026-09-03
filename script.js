/* ==========================================================
   ONION QUALITY PASSPORT — WORKING PROTOTYPE
   Heuristic (rule-based) grading — no trained model yet.
   Every graded lot (real upload or seed sample) is stored in
   `lots` so the Dispute Replay modal can reopen it later.
   ========================================================== */

const imageInput = document.getElementById('imageInput');
const officerGradeSelect = document.getElementById('officerGrade');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const resultPanel = document.getElementById('resultPanel');
const lotTableBody = document.querySelector('#lotTable tbody');

const modal = document.getElementById('replayModal');
const modalImage = document.getElementById('modalImage');
const modalLotId = document.getElementById('modalLotId');
const modalGradeBadge = document.getElementById('modalGradeBadge');
const modalScore = document.getElementById('modalScore');
const modalOfficer = document.getElementById('modalOfficer');
const modalTime = document.getElementById('modalTime');
const modalDefects = document.getElementById('modalDefects');
const closeModalBtn = document.getElementById('closeModal');

let lotCounter = 1;
const lots = []; // full record for every graded lot, used by the replay modal

/* ---------------- Upload → analyse → record ---------------- */

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const analysis = analyzeImageData(imageData);
    const officerGrade = officerGradeSelect.value || null;
    const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

    renderResult(analysis, officerGrade);
    recordLot(analysis, officerGrade, thumbnail);
  };
  img.src = URL.createObjectURL(file);
});

/**
 * Heuristic analysis on raw pixel data.
 * TODO (CV dev, national round): swap in OpenCV.js for real
 * contour-based size/shape detection instead of the bounding-box
 * estimate below, and calibrate thresholds against labelled photos.
 */
function analyzeImageData(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let darkPixelCount = 0;
  let foregroundCount = 0;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  const brightnessValues = new Array(totalPixels);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const brightness = (r + g + b) / 3;
      brightnessValues[py * width + px] = brightness;

      if (brightness < 70) darkPixelCount++;

      // Rough foreground/background split: assumes a lighter
      // background behind the onion. Good enough for a bounding-box
      // size estimate; a real system should use proper segmentation.
      if (brightness < 230) {
        foregroundCount++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  const darkRatio = foregroundCount ? darkPixelCount / totalPixels : 0;
  const avgBrightness = brightnessValues.reduce((a, b) => a + b, 0) / totalPixels;
  const variance = brightnessValues.reduce((sum, v) => sum + (v - avgBrightness) ** 2, 0) / totalPixels;
  const stdDev = Math.sqrt(variance);

  const boundingWidth = Math.max(1, maxX - minX);
  const boundingHeight = Math.max(1, maxY - minY);
  const sizeRatio = (boundingWidth * boundingHeight) / totalPixels; // fraction of frame filled

  // ---- Scoring (placeholder weights — calibrate against real
  // labelled photos before relying on this for real grading) ----
  let score = 100;
  score -= darkRatio * 150;
  score -= Math.max(0, stdDev - 40) * 0.5;
  if (sizeRatio < 0.08) score -= 15; // looks too small in frame — likely undersized onion
  score = Math.max(0, Math.min(100, Math.round(score)));

  const defects = [];
  if (darkRatio > 0.15) defects.push('Significant dark/rot patches detected');
  else if (darkRatio > 0.05) defects.push('Minor dark spotting detected');
  if (stdDev > 55) defects.push('Uneven skin tone / possible blemishes');
  if (sizeRatio < 0.08) defects.push('Onion appears small relative to frame');
  if (defects.length === 0) defects.push('No major defects detected');

  let grade = 'A';
  if (score < 40) grade = 'Reject';
  else if (score < 60) grade = 'C';
  else if (score < 80) grade = 'B';

  return {
    score,
    grade,
    defects,
    darkRatio: +(darkRatio * 100).toFixed(1),
    sizeRatio: +(sizeRatio * 100).toFixed(1),
  };
}

function renderResult(analysis, officerGrade) {
  const mismatch = officerGrade && officerGrade !== analysis.grade;
  resultPanel.innerHTML = `
    <span class="grade-badge grade-${analysis.grade}">Grade ${analysis.grade}</span>
    <p><strong>Score:</strong> ${analysis.score} / 100</p>
    <p><strong>Dark/rot pixel share:</strong> ${analysis.darkRatio}%</p>
    <p><strong>Estimated size in frame:</strong> ${analysis.sizeRatio}%</p>
    <p><strong>Why this grade:</strong></p>
    <ul class="defect-list">${analysis.defects.map(d => `<li>${d}</li>`).join('')}</ul>
    ${officerGrade
      ? `<p style="margin-top:0.75rem;"><strong>Second opinion:</strong> ${
          mismatch
            ? `<span style="color:#8C2F2F;">Officer said ${officerGrade} — flagged for review</span>`
            : `<span style="color:#4A7856;">Matches officer's grade</span>`
        }</p>`
      : ''}
  `;
}

function recordLot(analysis, officerGrade, thumbnail) {
  const lotId = `LOT-${String(lotCounter++).padStart(3, '0')}`;
  const lot = {
    id: lotId,
    grade: analysis.grade,
    score: analysis.score,
    defects: analysis.defects,
    officerGrade,
    thumbnail,
    timestamp: new Date().toLocaleString(),
  };
  lots.unshift(lot);
  renderLotTable();
}

/* ---------------- Dashboard table ---------------- */

function renderLotTable() {
  lotTableBody.innerHTML = '';
  lots.forEach((lot) => {
    const hasOfficer = !!lot.officerGrade;
    const mismatch = hasOfficer && lot.officerGrade !== lot.grade;
    const statusClass = !hasOfficer ? 'status-pending' : mismatch ? 'status-flag' : 'status-ok';
    const statusText = !hasOfficer ? 'No manual grade' : mismatch ? 'Flagged for review' : 'Matched';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${lot.id}</td>
      <td>${lot.grade}</td>
      <td>${lot.officerGrade || '—'}</td>
      <td class="${statusClass}">${statusText}</td>
      <td>${lot.timestamp}</td>
    `;
    row.addEventListener('click', () => openReplay(lot));
    lotTableBody.appendChild(row);
  });
}

/* ---------------- Dispute replay modal ---------------- */

function openReplay(lot) {
  modalLotId.textContent = lot.id;
  modalImage.src = lot.thumbnail;
  modalGradeBadge.textContent = `Grade ${lot.grade}`;
  modalGradeBadge.className = `grade-badge grade-${lot.grade}`;
  modalScore.textContent = lot.score;
  modalOfficer.textContent = lot.officerGrade || 'Not entered';
  modalTime.textContent = lot.timestamp;
  modalDefects.innerHTML = lot.defects.map(d => `<li>${d}</li>`).join('');
  modal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

/* ---------------- Seed sample rows on load ----------------
   Gives the dashboard something to show before anyone uploads
   a photo live. Each seed lot gets a small generated placeholder
   thumbnail (a solid circle in the grade's colour) since there's
   no real photo behind it — replace with real sample photos if
   you want the replay modal to show an actual onion.
------------------------------------------------------------- */

function makePlaceholderThumbnail(color) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 200;
  const cctx = c.getContext('2d');
  cctx.fillStyle = '#F7F1E8';
  cctx.fillRect(0, 0, 200, 200);
  cctx.fillStyle = color;
  cctx.beginPath();
  cctx.arc(100, 100, 70, 0, Math.PI * 2);
  cctx.fill();
  return c.toDataURL('image/jpeg', 0.85);
}

function seedRows() {
  const gradeColors = { A: '#4A7856', B: '#C97B4A', C: '#A45C36', Reject: '#8C2F2F' };
  const samples = [
    { grade: 'A', score: 91, officer: 'A', defects: ['No major defects detected'] },
    { grade: 'B', score: 72, officer: 'C', defects: ['Minor dark spotting detected'] },
    { grade: 'Reject', score: 22, officer: 'Reject', defects: ['Significant dark/rot patches detected'] },
  ];
  samples.forEach((s) => {
    recordLot(
      { grade: s.grade, score: s.score, defects: s.defects },
      s.officer,
      makePlaceholderThumbnail(gradeColors[s.grade])
    );
  });
}

seedRows();
