/**
 * aslClassifier.js — VisualAI ASL Classifier v3.0
 *
 * Dual-mode operation:
 *   1. TRAINED MODE  — loads asl_knn_model.json produced by train_model.py
 *                      and classifies using real KNN over your recorded data
 *   2. FALLBACK MODE — uses the geometric rule-based scorer (v2) if no
 *                      trained model is found or while it's loading
 *
 * The switch between modes is automatic — nothing to configure.
 */

// ── KNN Model State ───────────────────────────────────────────────────────────

let _knnModel = null;        // { X: float32[][], y: string[], k: number }
let _modelLoading = false;
let _modelLoaded = false;
let _modelError = null;

/**
 * Attempt to load the trained KNN model from the public folder.
 * Call this once on app startup (or it will be called lazily).
 */
export async function loadTrainedModel(url = "/asl_knn_model.json") {
  if (_modelLoaded || _modelLoading) return;
  _modelLoading = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.X || !data.y || !data.k) throw new Error("Invalid model format");

    _knnModel = {
      X: data.X.map(row => new Float32Array(row)),
      y: data.y,
      k: data.k ?? 5,
      classes: data.classes ?? [...new Set(data.y)].sort(),
    };
    _modelLoaded = true;
    console.log(`[VisualAI] Trained KNN model loaded: ${data.y.length} training vectors, k=${data.k}`);
  } catch (e) {
    _modelError = e.message;
    console.warn(`[VisualAI] Trained model not found (${e.message}) — using geometric classifier`);
  } finally {
    _modelLoading = false;
  }
}

export function isModelLoaded() { return _modelLoaded; }
export function getModelError() { return _modelError; }

// ── Feature Extraction (shared by both modes) ─────────────────────────────────

function dist3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalise 21 MediaPipe landmarks into a 63-dim float vector.
 * Matches exactly what train_model.py does in Python.
 */
function landmarksToFeatureVector(landmarks) {
  // Convert [{x,y,z}] → [[x,y,z]]
  const pts = landmarks.map(p => [p.x, p.y, p.z]);

  // Translate wrist to origin
  const wx = pts[0][0], wy = pts[0][1], wz = pts[0][2];
  for (let i = 0; i < 21; i++) {
    pts[i][0] -= wx; pts[i][1] -= wy; pts[i][2] -= wz;
  }

  // Scale by palm length (wrist → middle MCP = lm[9])
  const scale = dist3(pts[0], pts[9]) || 1;
  for (let i = 0; i < 21; i++) {
    pts[i][0] /= scale; pts[i][1] /= scale; pts[i][2] /= scale;
  }

  // Flatten to 63-dim vector
  const vec = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    vec[i * 3] = pts[i][0];
    vec[i * 3 + 1] = pts[i][1];
    vec[i * 3 + 2] = pts[i][2];
  }
  return vec;
}

// ── KNN Inference ─────────────────────────────────────────────────────────────

function euclideanSq(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

function knnPredict(vec) {
  const { X, y, k } = _knnModel;
  const n = X.length;

  // Compute distances to all training vectors
  const dists = new Array(n);
  for (let i = 0; i < n; i++) {
    dists[i] = { d: euclideanSq(vec, X[i]), label: y[i] };
  }

  // Partial sort — only need k smallest
  dists.sort((a, b) => a.d - b.d);
  const neighbors = dists.slice(0, k);

  // Weighted vote: weight = 1 / (dist + ε)
  const votes = {};
  for (const { d, label } of neighbors) {
    const w = 1 / (Math.sqrt(d) + 1e-6);
    votes[label] = (votes[label] || 0) + w;
  }

  // Best letter
  let bestLetter = null, bestWeight = 0;
  for (const [l, w] of Object.entries(votes)) {
    if (w > bestWeight) { bestWeight = w; bestLetter = l; }
  }

  // Confidence: fraction of total vote weight
  const totalW = Object.values(votes).reduce((s, w) => s + w, 0);
  const confidence = totalW > 0 ? bestWeight / totalW : 0;

  return { letter: bestLetter, confidence };
}

function mirrorLandmarks(landmarks) {
  const wrist = landmarks[0];
  return landmarks.map(p => ({ x: wrist.x - (p.x - wrist.x), y: p.y, z: p.z }));
}

function knnPredictLandmarks(landmarks) {
  const original = knnPredict(landmarksToFeatureVector(landmarks));
  const mirrored = knnPredict(landmarksToFeatureVector(mirrorLandmarks(landmarks)));
  return original.confidence >= mirrored.confidence ? original : mirrored;
}

function scoreGeometricLandmarks(landmarks) {
  const features = extractFeatures(landmarks);
  let bestLetter = null;
  let bestScore = MIN_CONF;
  const allScores = {};

  for (const [l, scoreFn] of Object.entries(SCORERS)) {
    const score = clamp(scoreFn(features), 0, 1);
    allScores[l] = +score.toFixed(3);
    if (score > bestScore) { bestScore = score; bestLetter = l; }
  }

  return { letter: bestLetter, confidence: bestScore, allScores };
}

// ── Geometric Fallback (v2 rule-based) ───────────────────────────────────────

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}
function angleBetween(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = v1.x * v2.x + v1.y * v2.y;
  const m = Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (m < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, d / m))) * 180 / Math.PI;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function normaliseLandmarks(lm) {
  const wrist = lm[0], scale = dist(lm[0], lm[9]) || 1;
  return lm.map(p => ({ x: (p.x - wrist.x) / scale, y: (p.y - wrist.y) / scale, z: (p.z - wrist.z) / scale }));
}

function extractFeatures(rawLm) {
  const lm = normaliseLandmarks(rawLm);
  const wrist = lm[0];
  const TIPS = [4, 8, 12, 16, 20], PIPS = [3, 7, 11, 15, 19];
  const tipD = TIPS.map(i => dist(lm[i], wrist));
  const pipD = PIPS.map(i => dist(lm[i], wrist));
  const extRatio = tipD.map((d, i) => d / (pipD[i] + 1e-6));
  const ext = extRatio.map(r => r > 1.05 ? 1 : 0);
  const curl = tipD.map((d, i) => clamp(1 - d / (pipD[i] + 1e-6), 0, 1));
  const thumbIdx = dist(lm[4], lm[8]), thumbMid = dist(lm[4], lm[12]);
  const thumbRng = dist(lm[4], lm[16]), thumbPnk = dist(lm[4], lm[20]);
  const idxMid = dist(lm[8], lm[12]), midRng = dist(lm[12], lm[16]);
  const rngPnk = dist(lm[16], lm[20]);
  const tx = lm[4].x, ty = lm[4].y;
  const ix = lm[8].x, iy = lm[8].y;
  const mx = lm[12].x, my = lm[12].y;
  const thumbExtended = extRatio[0] > 1.1;
  const allFolded = ext[1] === 0 && ext[2] === 0 && ext[3] === 0 && ext[4] === 0;
  const indexCrossedMiddle = lm[8].x < lm[12].x;
  const angles = { indexPIP: angleBetween(lm[5], lm[6], lm[7]), middlePIP: angleBetween(lm[9], lm[10], lm[11]) };
  return {
    lm, ext, curl, extRatio, angles, thumbIdx, thumbMid, thumbRng, thumbPnk,
    idxMid, midRng, rngPnk, tx, ty, ix, iy, mx, my, thumbExtended, allFolded, indexCrossedMiddle
  };
}

const SCORERS = {
  A: f => { let s = 0; if (f.allFolded) s += .30; if (f.tx > .08 && f.tx < .50) s += .25; if (f.ty < f.lm[6].y) s += .15; if (f.thumbIdx > .18 && f.thumbIdx < .60) s += .15; if (f.curl[1] > .40 && f.curl[2] > .40) s += .15; return s; },
  B: f => { let s = 0; if (f.ext[1] && f.ext[2] && f.ext[3] && f.ext[4]) s += .35; if (f.tx < -.05) s += .25; if (f.idxMid < .40 && f.midRng < .40) s += .20; if (f.angles.indexPIP > 155) s += .10; if (f.iy < -.50) s += .10; return s; },
  C: f => { let s = 0; const mc = f.curl[1] > .12 && f.curl[1] < .72 && f.curl[2] > .12 && f.curl[2] < .72; if (mc) s += .30; if (f.thumbIdx > .35 && f.thumbIdx < 1.30) s += .25; if (f.tx > .08) s += .20; if (!f.ext[1] && !f.ext[2]) s += .15; return s; },
  D: f => { let s = 0; if (f.ext[1]) s += .28; if (!f.ext[2] && !f.ext[3] && !f.ext[4]) s += .22; if (f.thumbMid < .38) s += .28; if (f.thumbIdx > .32) s += .12; if (f.iy < -.50) s += .10; return s; },
  E: f => { let s = 0; if (f.curl[1] > .38 && f.curl[2] > .38 && f.curl[3] > .38 && f.curl[4] > .38) s += .38; if (f.tx < .18) s += .20; if (f.angles.indexPIP < 125) s += .20; if (f.thumbIdx < .38) s += .10; return s; },
  F: f => { let s = 0; if (f.ext[2] && f.ext[3] && f.ext[4]) s += .35; if (f.thumbIdx < .32) s += .32; if (!f.ext[1]) s += .23; return s; },
  G: f => { let s = 0; if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += .25; if (Math.abs(f.iy) < .50) s += .28; if (f.ix > .20) s += .22; if (f.thumbIdx < .65) s += .15; return s; },
  H: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (Math.abs(f.iy) < .52) s += .22; if (f.idxMid < .38) s += .22; if (f.ix > .18) s += .18; return s; },
  I: f => { let s = 0; if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += .48; if (!f.thumbExtended) s += .22; if (f.curl[1] > .38 && f.curl[2] > .38) s += .20; return s; },
  J: f => { let s = 0; if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += .38; if (f.thumbExtended && f.tx > .22) s += .32; if (f.curl[1] > .32) s += .20; return s; },
  K: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (f.idxMid > .28) s += .18; if (f.thumbIdx < .58 && f.thumbMid < .58) s += .24; if (f.ty < -.05) s += .18; return s; },
  L: f => { let s = 0; if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (f.thumbExtended && f.tx > .40) s += .32; if (f.thumbIdx > .55) s += .18; return s; },
  M: f => { let s = 0; if (f.curl[1] > .42 && f.curl[2] > .42 && f.curl[3] > .42) s += .32; if (f.thumbIdx < .52) s += .20; if (f.ty > f.lm[5].y) s += .18; return s; },
  N: f => { let s = 0; if (f.curl[1] > .42 && f.curl[2] > .42) s += .28; if (f.curl[3] < .48 && f.curl[4] < .48) s += .20; if (f.thumbIdx < .52) s += .20; return s; },
  O: f => { let s = 0; if (f.thumbIdx < .38) s += .28; if (f.thumbMid < .50) s += .18; if (f.curl[1] > .22 && f.curl[2] > .22 && f.curl[3] > .22) s += .28; return s; },
  P: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (f.iy > .22) s += .32; if (f.thumbIdx < .58) s += .20; return s; },
  Q: f => { let s = 0; if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += .22; if (f.iy > .32) s += .28; if (f.thumbIdx < .42) s += .24; return s; },
  R: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .32; if (f.idxMid < .22) s += .38; if (f.curl[3] > .28 && f.curl[4] > .28) s += .20; return s; },
  S: f => { let s = 0; if (f.allFolded) s += .32; if (f.tx < .12) s += .25; if (f.ty < f.lm[6].y) s += .22; return s; },
  T: f => { let s = 0; if (f.curl[1] > .42 && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (f.thumbIdx < .48) s += .22; return s; },
  U: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .33; if (f.idxMid < .26) s += .38; return s; },
  V: f => { let s = 0; if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += .33; if (f.idxMid > .36) s += .38; return s; },
  W: f => { let s = 0; if (f.ext[1] && f.ext[2] && f.ext[3] && !f.ext[4]) s += .48; if (f.idxMid > .18 && f.midRng > .18) s += .28; return s; },
  X: f => { let s = 0; if (f.curl[1] > .22 && f.curl[1] < .75) s += .32; if (!f.ext[2] && !f.ext[3] && !f.ext[4]) s += .28; if (f.angles.indexPIP < 152 && f.angles.indexPIP > 75) s += .30; return s; },
  Y: f => { let s = 0; if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += .33; if (f.thumbExtended && f.tx > .25) s += .33; if (f.curl[1] > .28 && f.curl[2] > .28) s += .26; return s; },
  Z: f => { let s = 0; if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += .38; if (!f.thumbExtended) s += .22; if (f.thumbIdx > .38) s += .20; return s; },
};

const MIN_CONF = 0.62;

// ── Temporal Smoothing ────────────────────────────────────────────────────────

const HISTORY_SIZE = 6;
const _history = [];

function smoothPrediction(letter, confidence) {
  _history.push({ letter, confidence });
  if (_history.length > HISTORY_SIZE) _history.shift();

  const votes = {};
  _history.forEach(({ letter: l, confidence: c }, idx) => {
    const w = (idx + 1) / _history.length;
    votes[l] = (votes[l] || 0) + w * c;
  });

  let bestLetter = null, bestWeight = 0;
  for (const [l, w] of Object.entries(votes)) {
    if (w > bestWeight) { bestWeight = w; bestLetter = l; }
  }

  const hits = _history.filter(h => h.letter === bestLetter);
  const avgConf = hits.reduce((s, h) => s + h.confidence, 0) / hits.length;
  return { letter: bestLetter, confidence: avgConf };
}

// ── Main Export ────────────────────────────────────────────────────────────────

/**
 * Classify ASL letter from 21 MediaPipe hand landmarks.
 * Auto-selects trained KNN model (if loaded) or geometric fallback.
 *
 * @param {Array}   landmarks - Array of 21 {x,y,z} from MediaPipe
 * @param {boolean} debug     - If true, includes allScores in result
 */
export function classifyASL(landmarks, debug = false) {
  if (!landmarks || landmarks.length < 21) return null;

  let letter = null, confidence = 0;
  let mode = "geometric";
  let allScores = {};

  let knnResult = null;
  if (_modelLoaded && _knnModel) {
    try {
      knnResult = knnPredictLandmarks(landmarks);
    } catch (e) {
      knnResult = null;
    }
  }

  const originalGeo = scoreGeometricLandmarks(landmarks);
  const mirroredGeo = scoreGeometricLandmarks(mirrorLandmarks(landmarks));
  const geoResult = originalGeo.confidence >= mirroredGeo.confidence ? originalGeo : mirroredGeo;

  if (knnResult && knnResult.confidence >= MIN_CONF && knnResult.confidence >= geoResult.confidence) {
    letter = knnResult.letter;
    confidence = knnResult.confidence;
    mode = "knn";
  } else if (geoResult.confidence >= MIN_CONF) {
    letter = geoResult.letter;
    confidence = geoResult.confidence;
    allScores = geoResult.allScores;
    mode = "geometric";
  } else {
    return null;
  }

  if (!letter) return null;

  const smoothed = smoothPrediction(letter, confidence);
  return {
    letter: smoothed.letter,
    confidence: +smoothed.confidence.toFixed(3),
    mode,
    ...(debug ? { allScores } : {}),
  };
}

export function resetHistory() { _history.length = 0; }
export { normaliseLandmarks, extractFeatures };

// Try loading model immediately on module load
loadTrainedModel().catch(() => { });