/**
 * aslClassifier.js — Improved ASL A–Z Classifier
 *
 * Uses a scoring system with multiple features per letter:
 * - Finger extension ratios
 * - Joint angles
 * - Thumb position
 * - Inter-finger distances
 * - Palm orientation
 *
 * Each letter has a weighted multi-feature score for higher accuracy.
 */

// ── Geometry Helpers ──────────────────────────────────────────────────────────

function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}

function dist2D(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

function dot(a, b) {
  return a.x*b.x + a.y*b.y;
}

function angleBetween(a, b, c) {
  const v1 = { x: a.x-b.x, y: a.y-b.y };
  const v2 = { x: c.x-b.x, y: c.y-b.y };
  const d  = dot(v1,v2);
  const m  = Math.sqrt(v1.x**2+v1.y**2) * Math.sqrt(v2.x**2+v2.y**2);
  if (m < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, d/m))) * 180 / Math.PI;
}

// ── Normalise Landmarks ───────────────────────────────────────────────────────

function normaliseLandmarks(lm) {
  const w   = lm[0];
  const ref = dist(lm[0], lm[9]) || 1;
  return lm.map(p => ({
    x: (p.x - w.x) / ref,
    y: (p.y - w.y) / ref,
    z: (p.z - w.z) / ref,
  }));
}

// ── Feature Extraction ────────────────────────────────────────────────────────

function extractFeatures(rawLm) {
  const lm    = normaliseLandmarks(rawLm);
  const wrist = lm[0];

  // Landmark indices
  // Thumb:  1(CMC) 2(MCP) 3(IP)  4(TIP)
  // Index:  5(MCP) 6(PIP) 7(DIP) 8(TIP)
  // Middle: 9(MCP) 10(PIP) 11(DIP) 12(TIP)
  // Ring:   13(MCP) 14(PIP) 15(DIP) 16(TIP)
  // Pinky:  17(MCP) 18(PIP) 19(DIP) 20(TIP)

  const tips = [4,  8,  12, 16, 20];
  const pips = [3,  7,  11, 15, 19];
  const dips = [2,  6,  10, 14, 18];
  const mcps = [1,  5,   9, 13, 17];

  // Distance from wrist
  const tipD = tips.map(i => dist(lm[i], wrist));
  const pipD = pips.map(i => dist(lm[i], wrist));
  const dipD = dips.map(i => dist(lm[i], wrist));
  const mcpD = mcps.map(i => dist(lm[i], wrist));

  // Extension ratio: >1 = extended, <1 = curled
  const extRatio = tipD.map((d,i) => d / (pipD[i] + 1e-6));

  // Binary extension (threshold 1.0)
  const ext = extRatio.map(r => r > 1.0 ? 1 : 0);

  // Curl amount (0=straight, 1=fully curled)
  const curl = tipD.map((d,i) => Math.max(0, Math.min(1, 1 - d/(pipD[i]+1e-6))));

  // Joint angles for each finger
  const angles = {
    thumbIP:   angleBetween(lm[2], lm[3], lm[4]),
    indexPIP:  angleBetween(lm[5], lm[6], lm[7]),
    indexDIP:  angleBetween(lm[6], lm[7], lm[8]),
    middlePIP: angleBetween(lm[9], lm[10], lm[11]),
    ringPIP:   angleBetween(lm[13], lm[14], lm[15]),
    pinkyPIP:  angleBetween(lm[17], lm[18], lm[19]),
  };

  // Key distances
  const thumbIdx  = dist(lm[4], lm[8]);
  const thumbMid  = dist(lm[4], lm[12]);
  const thumbRng  = dist(lm[4], lm[16]);
  const thumbPnk  = dist(lm[4], lm[20]);
  const idxMid    = dist(lm[8], lm[12]);
  const midRng    = dist(lm[12], lm[16]);
  const rngPnk    = dist(lm[16], lm[20]);
  const idxRng    = dist(lm[8], lm[16]);
  const idxPnk    = dist(lm[8], lm[20]);

  // Thumb tip relative to hand
  const tx = lm[4].x, ty = lm[4].y, tz = lm[4].z;

  // Index tip direction
  const ix = lm[8].x, iy = lm[8].y;

  // Thumb MCP position
  const tmcpX = lm[2].x, tmcpY = lm[2].y;

  // Palm normal (up/down facing)
  const palmY = lm[9].y - lm[0].y; // positive = palm facing down

  // Thumb above/below index MCP
  const thumbAboveIdxMCP = ty < lm[5].y;
  const thumbBelowIdxMCP = ty > lm[5].y;

  // All fingers folded / extended
  const allFolded   = ext[1]===0 && ext[2]===0 && ext[3]===0 && ext[4]===0;
  const allExtended = ext[1]===1 && ext[2]===1 && ext[3]===1 && ext[4]===1;

  // Spread between fingers
  const fingersSpread = idxMid + midRng + rngPnk;

  return {
    lm, ext, curl, extRatio, angles,
    thumbIdx, thumbMid, thumbRng, thumbPnk,
    idxMid, midRng, rngPnk, idxRng, idxPnk,
    tx, ty, tz, ix, iy,
    tmcpX, tmcpY,
    palmY, thumbAboveIdxMCP, thumbBelowIdxMCP,
    allFolded, allExtended, fingersSpread,
    tipD, pipD, dipD, mcpD,
  };
}

// ── Letter Scoring Functions ───────────────────────────────────────────────────
// Returns score 0..1. Higher = better match.

function scoreA(f) {
  // Fist, all fingers folded, thumb on side of index (not tucked under)
  let s = 0;
  if (f.allFolded)                          s += 0.35;
  if (f.tx > 0.10 && f.tx < 0.45)          s += 0.25; // thumb to the side
  if (f.ty < f.lm[6].y)                    s += 0.20; // thumb above PIP of index
  if (f.thumbIdx > 0.20 && f.thumbIdx < 0.55) s += 0.20; // thumb not touching index tip
  return s;
}

function scoreB(f) {
  // All 4 fingers straight up, thumb tucked across palm
  let s = 0;
  if (f.ext[1] && f.ext[2] && f.ext[3] && f.ext[4]) s += 0.40;
  if (f.tx < -0.05)                                   s += 0.25; // thumb tucked inward
  if (f.idxMid < 0.40 && f.midRng < 0.40)            s += 0.20; // fingers close together
  if (f.angles.indexPIP > 150)                        s += 0.15; // index straight
  return s;
}

function scoreC(f) {
  // All fingers curved in C shape, gap between thumb and index
  let s = 0;
  const allCurled = f.curl[1]>0.15 && f.curl[1]<0.70 &&
                    f.curl[2]>0.15 && f.curl[2]<0.70 &&
                    f.curl[3]>0.15 && f.curl[3]<0.70;
  if (allCurled)                            s += 0.35;
  if (f.thumbIdx > 0.40 && f.thumbIdx < 1.2) s += 0.25; // gap between thumb and index
  if (f.tx > 0.05)                          s += 0.20; // thumb curves outward
  if (!f.ext[1] && !f.ext[2])              s += 0.20; // fingers not fully extended
  return s;
}

function scoreD(f) {
  // Index up, thumb touches middle, others folded
  let s = 0;
  if (f.ext[1])                             s += 0.30; // index up
  if (!f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.25; // others folded
  if (f.thumbMid < 0.35)                   s += 0.30; // thumb touches middle
  if (f.thumbIdx > 0.35)                   s += 0.15; // thumb NOT touching index
  return s;
}

function scoreE(f) {
  // All fingers curled like claws, thumb tucked under
  let s = 0;
  if (f.curl[1]>0.40 && f.curl[2]>0.40 && f.curl[3]>0.40 && f.curl[4]>0.40) s += 0.40;
  if (f.tx < 0.15)                          s += 0.20; // thumb tucked under
  if (f.angles.indexPIP < 120)              s += 0.20; // index strongly bent
  if (f.angles.middlePIP < 120)             s += 0.20; // middle strongly bent
  return s;
}

function scoreF(f) {
  // Index+thumb circle, middle+ring+pinky up
  let s = 0;
  if (f.ext[2] && f.ext[3] && f.ext[4])    s += 0.35; // mid+ring+pinky up
  if (f.thumbIdx < 0.30)                   s += 0.35; // thumb touches index
  if (!f.ext[1])                            s += 0.30; // index folded down
  return s;
}

function scoreG(f) {
  // Index pointing sideways, thumb parallel, others folded
  let s = 0;
  if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (Math.abs(f.iy) < 0.45)               s += 0.30; // index horizontal
  if (f.ix > 0.25)                         s += 0.25; // index pointing sideways
  if (f.thumbIdx < 0.60)                   s += 0.15; // thumb near index
  return s;
}

function scoreH(f) {
  // Index + middle pointing sideways together
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (Math.abs(f.iy) < 0.50)               s += 0.25; // horizontal
  if (f.idxMid < 0.35)                     s += 0.25; // fingers together
  if (f.ix > 0.20)                         s += 0.20; // pointing sideways
  return s;
}

function scoreI(f) {
  // Only pinky extended, no thumb
  let s = 0;
  if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += 0.50;
  if (!f.ext[0])                            s += 0.25; // thumb not extended
  if (f.curl[1] > 0.40 && f.curl[2] > 0.40) s += 0.25; // index+middle curled
  return s;
}

function scoreJ(f) {
  // Pinky up + thumb extended (I with thumb out)
  let s = 0;
  if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += 0.40;
  if (f.ext[0] && f.tx > 0.25)             s += 0.35; // thumb extended sideways
  if (f.curl[1] > 0.35)                    s += 0.25; // index curled
  return s;
}

function scoreK(f) {
  // Index + middle up spread, thumb between them pointing up
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (f.idxMid > 0.30)                     s += 0.20; // fingers spread
  if (f.thumbIdx < 0.55 && f.thumbMid < 0.55) s += 0.25; // thumb between fingers
  if (f.ty < 0)                            s += 0.25; // thumb pointing up
  return s;
}

function scoreL(f) {
  // L shape: index up, thumb out sideways
  let s = 0;
  if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (f.ext[0] && f.tx > 0.38)             s += 0.35; // thumb far to the side
  if (f.thumbIdx > 0.55)                   s += 0.20; // clear gap (L angle)
  if (f.curl[2] > 0.35)                    s += 0.15; // middle folded
  return s;
}

function scoreM(f) {
  // Three fingers (idx+mid+rng) folded over tucked thumb
  let s = 0;
  if (f.curl[1]>0.45 && f.curl[2]>0.45 && f.curl[3]>0.45) s += 0.35;
  if (f.curl[4] < 0.50)                    s += 0.15; // pinky less curled
  if (f.thumbIdx < 0.50)                   s += 0.20; // thumb tucked under
  if (f.ty > f.lm[5].y)                   s += 0.20; // thumb below index MCP
  if (f.tx < 0.20)                         s += 0.10; // thumb not sticking out
  return s;
}

function scoreN(f) {
  // Two fingers (idx+mid) folded over tucked thumb
  let s = 0;
  if (f.curl[1]>0.45 && f.curl[2]>0.45)   s += 0.30;
  if (f.curl[3] < 0.45 && f.curl[4] < 0.45) s += 0.20; // ring+pinky less curled
  if (f.thumbIdx < 0.50)                   s += 0.20; // thumb tucked
  if (f.ty > f.lm[5].y)                   s += 0.20; // thumb below index MCP
  if (f.tx < 0.20)                         s += 0.10; // thumb not sticking out
  return s;
}

function scoreO(f) {
  // All fingertips touch thumb — closed O
  let s = 0;
  if (f.thumbIdx < 0.35)                   s += 0.30; // thumb meets index
  if (f.thumbMid < 0.45)                   s += 0.20; // thumb near middle
  if (f.curl[1]>0.25 && f.curl[2]>0.25 && f.curl[3]>0.25) s += 0.30;
  if (f.thumbIdx > 0.05)                   s += 0.20; // not completely flat
  return s;
}

function scoreP(f) {
  // Like K but rotated — fingers pointing downward
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (f.iy > 0.25 && f.lm[12].y > 0.25)  s += 0.35; // fingers pointing down
  if (f.thumbIdx < 0.55)                   s += 0.20; // thumb between fingers
  if (f.ty > 0)                            s += 0.15; // thumb also pointing down
  return s;
}

function scoreQ(f) {
  // Like G but rotated — index + thumb pointing downward
  let s = 0;
  if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.25;
  if (f.iy > 0.35)                         s += 0.30; // index pointing down
  if (f.thumbIdx < 0.40)                   s += 0.25; // thumb close to index
  if (f.ty > 0.30)                         s += 0.20; // thumb also down
  return s;
}

function scoreR(f) {
  // Index + middle crossed (very close together)
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.35;
  if (f.idxMid < 0.20)                     s += 0.40; // very close together (crossed)
  if (f.curl[3] > 0.30 && f.curl[4] > 0.30) s += 0.25; // ring+pinky folded
  return s;
}

function scoreS(f) {
  // Tight fist, thumb wraps over front of fingers
  let s = 0;
  if (f.allFolded)                          s += 0.35;
  if (f.tx < 0.10)                         s += 0.25; // thumb across front
  if (f.ty < f.lm[6].y)                   s += 0.25; // thumb at knuckle level
  if (f.curl[1]>0.45 && f.curl[2]>0.45)   s += 0.15; // fingers tightly curled
  return s;
}

function scoreT(f) {
  // Thumb between index and middle (pokes between them)
  let s = 0;
  if (f.curl[1]>0.45 && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30;
  if (f.tx < 0.25)                         s += 0.20; // thumb not sticking far out
  if (f.ty < f.lm[6].y)                   s += 0.25; // thumb at or above index PIP
  if (f.thumbIdx < 0.45)                   s += 0.25; // thumb close to index
  return s;
}

function scoreU(f) {
  // Index + middle up, pressed together
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.35;
  if (f.idxMid < 0.28)                     s += 0.40; // fingers CLOSE together
  if (f.curl[3] > 0.30 && f.curl[4] > 0.30) s += 0.25; // ring+pinky folded
  return s;
}

function scoreV(f) {
  // Index + middle up, spread apart (peace sign)
  let s = 0;
  if (f.ext[1] && f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.35;
  if (f.idxMid > 0.38)                     s += 0.40; // fingers SPREAD apart
  if (f.curl[3] > 0.30 && f.curl[4] > 0.30) s += 0.25; // ring+pinky folded
  return s;
}

function scoreW(f) {
  // Index + middle + ring up, spread
  let s = 0;
  if (f.ext[1] && f.ext[2] && f.ext[3] && !f.ext[4]) s += 0.50;
  if (f.idxMid > 0.20 && f.midRng > 0.20) s += 0.30; // spread apart
  if (f.curl[4] > 0.25)                   s += 0.20; // pinky folded
  return s;
}

function scoreX(f) {
  // Index finger hooked (bent at middle joint)
  let s = 0;
  if (f.curl[1]>0.25 && f.curl[1]<0.72)   s += 0.35; // index half-curled
  if (!f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.30; // others folded
  if (f.angles.indexPIP < 150 && f.angles.indexPIP > 80) s += 0.35; // bent at PIP
  return s;
}

function scoreY(f) {
  // Thumb + pinky out, others folded (hang loose)
  let s = 0;
  if (!f.ext[1] && !f.ext[2] && !f.ext[3] && f.ext[4]) s += 0.35;
  if (f.ext[0] && f.tx > 0.28)             s += 0.35; // thumb extended sideways
  if (f.curl[1]>0.30 && f.curl[2]>0.30)   s += 0.30; // index+middle folded
  return s;
}

function scoreZ(f) {
  // Index pointing (like D but no thumb contact) — motion sign
  let s = 0;
  if (f.ext[1] && !f.ext[2] && !f.ext[3] && !f.ext[4]) s += 0.40;
  if (!f.ext[0])                            s += 0.25; // thumb not out
  if (f.thumbIdx > 0.40)                   s += 0.20; // thumb not touching index
  if (f.thumbMid > 0.40)                   s += 0.15; // thumb not touching middle
  return s;
}

// ── All Scorers ───────────────────────────────────────────────────────────────

const SCORERS = {
  A: scoreA, B: scoreB, C: scoreC, D: scoreD, E: scoreE,
  F: scoreF, G: scoreG, H: scoreH, I: scoreI, J: scoreJ,
  K: scoreK, L: scoreL, M: scoreM, N: scoreN, O: scoreO,
  P: scoreP, Q: scoreQ, R: scoreR, S: scoreS, T: scoreT,
  U: scoreU, V: scoreV, W: scoreW, X: scoreX, Y: scoreY,
  Z: scoreZ,
};

// Minimum confidence threshold — raise this for stricter detection
const MIN_CONFIDENCE = 0.62;

// ── Temporal Smoothing ────────────────────────────────────────────────────────
// Keeps a rolling window of recent predictions to reduce flickering

const HISTORY_SIZE  = 5;
const letterHistory = [];

function smoothPrediction(letter, confidence) {
  letterHistory.push({ letter, confidence });
  if (letterHistory.length > HISTORY_SIZE) letterHistory.shift();

  // Count votes for each letter in history
  const votes = {};
  for (const h of letterHistory) {
    if (!votes[h.letter]) votes[h.letter] = { count:0, totalConf:0 };
    votes[h.letter].count++;
    votes[h.letter].totalConf += h.confidence;
  }

  // Pick letter with most votes (majority wins)
  let bestLetter = null, bestVotes = 0, bestConf = 0;
  for (const [l, v] of Object.entries(votes)) {
    if (v.count > bestVotes || (v.count === bestVotes && v.totalConf > bestConf)) {
      bestVotes  = v.count;
      bestConf   = v.totalConf / v.count;
      bestLetter = l;
    }
  }

  return { letter: bestLetter, confidence: bestConf };
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Classify ASL letter from MediaPipe hand landmarks.
 * @param {Array} landmarks  - 21 {x,y,z} objects from MediaPipe
 * @returns {{ letter: string, confidence: number, allScores: object } | null}
 */
export function classifyASL(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  const features   = extractFeatures(landmarks

  );
  const allScores  = {};
  let bestLetter   = null;
  let bestScore    = MIN_CONFIDENCE;

  for (const [letter, scoreFn] of Object.entries(SCORERS)) {
    const score     = Math.min(1, scoreFn(features));
    allScores[letter] = score;
    if (score > bestScore) {
      bestScore  = score;
      bestLetter = letter;
    }
  }

  if (!bestLetter) return null;

  // Apply temporal smoothing
  const smoothed = smoothPrediction(bestLetter, bestScore);
  return {
    letter:     smoothed.letter,
    confidence: smoothed.confidence,
    allScores,
  };
}

export function resetHistory() {
  letterHistory.length = 0;
}

export { normaliseLandmarks, extractFeatures };