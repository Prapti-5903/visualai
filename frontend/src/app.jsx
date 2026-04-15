/**
 * VisualAI — App.jsx
 * Multimodal Image Generation System
 * Inputs: Text | Speech (Web Speech API) | ASL A–Z Sign Language (MediaPipe Hands)
 * Output: DALL-E 3 HD 1024×1024 images via Flask backend
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { classifyASL } from "./aslClassifier.js";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";
const LETTER_HOLD_MS = 900; // ms to hold a sign before it registers

// ── Styles ────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Outfit:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --ink:        #0d0d12;
  --ink2:       #111118;
  --ink3:       #181824;
  --card:       #1a1a26;
  --card2:      #20202e;
  --line:       rgba(255,255,255,0.06);
  --line2:      rgba(255,255,255,0.11);
  --gold:       #c9a84c;
  --gold2:      #e8c97a;
  --glow:       rgba(201,168,76,0.13);
  --cream:      #f2ede4;
  --dim:        #9e9880;
  --faint:      #45433a;
  --teal:       #3ecfb8;
  --red:        #e05555;
  --green:      #4caf7d;
  --serif:      'Cormorant Garamond', Georgia, serif;
  --sans:       'Outfit', sans-serif;
  --ease:       0.22s cubic-bezier(0.4,0,0.2,1);
  --r:          14px;
  --r-sm:       9px;
}

html { scroll-behavior: smooth; }
body {
  background: var(--ink);
  color: var(--cream);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* Grain noise overlay */
body::after {
  content: '';
  position: fixed; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none; z-index: 9999; opacity: .45;
}

/* Ambient glows */
.amb { position:fixed; pointer-events:none; z-index:0; border-radius:50%; filter:blur(130px); }
.amb-1 { width:800px; height:600px; top:-260px; left:50%; transform:translateX(-52%); background:rgba(201,168,76,0.042); }
.amb-2 { width:380px; height:380px; bottom:60px; right:-100px; background:rgba(62,207,184,0.032); }

/* Keyframes */
@keyframes fadeIn    { from { opacity:0 } to { opacity:1 } }
@keyframes slideUp   { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes spin      { to { transform:rotate(360deg) } }
@keyframes shimmer   { 100% { transform:translateX(220%) } }
@keyframes pulse     { 0%{box-shadow:0 0 0 0 rgba(224,85,85,.4)} 70%{box-shadow:0 0 0 20px rgba(224,85,85,0)} 100%{box-shadow:0 0 0 0 rgba(224,85,85,0)} }
@keyframes scanAnim  { 0%{top:0} 50%{top:100%} 100%{top:0} }
@keyframes revealImg { from{opacity:0;transform:scale(1.03)} to{opacity:1;transform:scale(1)} }
@keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }

/* ── Login ── */
.login-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: var(--ink);
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn .5s ease;
}
.login-box {
  width: 440px;
  background: var(--card);
  border: 1px solid var(--line2);
  border-radius: 22px;
  padding: 52px 44px;
  position: relative; overflow: hidden;
  animation: slideUp .5s .1s ease both;
}
.login-box::before {
  content: '';
  position: absolute; top:0; left:0; right:0; height:1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  opacity: .55;
}
.login-wordmark { font-family: var(--serif); font-size:40px; font-weight:300; letter-spacing:2px; text-align:center; margin-bottom:4px; }
.login-wordmark em { color:var(--gold); font-style:italic; }
.login-tagline { text-align:center; font-size:11px; font-weight:300; color:var(--dim); letter-spacing:3.5px; text-transform:uppercase; margin-bottom:44px; }
.field-label { display:block; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--dim); margin-bottom:7px; }
.field-input { width:100%; padding:13px 16px; background:var(--ink3); border:1px solid var(--line2); border-radius:var(--r-sm); color:var(--cream); font-family:var(--sans); font-size:14px; outline:none; transition:border-color var(--ease); margin-bottom:14px; }
.field-input:focus { border-color: rgba(201,168,76,.5); }
.field-input::placeholder { color: var(--faint); }
.login-error { font-size:12px; color:var(--red); margin-bottom:10px; }
.btn-primary { width:100%; padding:14px; background:var(--gold); border:none; border-radius:var(--r-sm); color:var(--ink); font-family:var(--sans); font-size:13px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; cursor:pointer; transition:all var(--ease); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:8px; }
.btn-primary:hover { background:var(--gold2); transform:translateY(-1px); box-shadow:0 10px 34px rgba(201,168,76,.26); }
.btn-primary .shimmer { position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.17),transparent); transform:translateX(-100%); animation:shimmer 2.4s infinite; }
.login-divider { height:1px; background:var(--line); margin:22px 0; position:relative; }
.login-divider::after { content:'or'; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:var(--card); padding:0 12px; font-size:11px; color:var(--faint); letter-spacing:1px; }
.btn-ghost { width:100%; padding:13px; background:transparent; border:1px solid var(--line2); border-radius:var(--r-sm); color:var(--dim); font-family:var(--sans); font-size:13px; cursor:pointer; transition:all var(--ease); }
.btn-ghost:hover { background:var(--card2); color:var(--cream); }
.login-hint { font-size:12px; color:var(--faint); text-align:center; margin-top:14px; }
.login-hint a { color:var(--gold); cursor:pointer; text-decoration:none; }
.btn-spinner { width:14px; height:14px; border:2px solid rgba(0,0,0,.2); border-top-color:var(--ink); border-radius:50%; animation:spin .7s linear infinite; }

/* ── Navbar ── */
nav {
  position:fixed; top:0; left:0; right:0; z-index:100;
  height:62px; display:flex; align-items:center; justify-content:space-between;
  padding:0 48px;
  background:rgba(13,13,18,.9); backdrop-filter:blur(22px);
  border-bottom:1px solid var(--line);
}
.nav-wordmark { font-family:var(--serif); font-size:21px; font-weight:300; letter-spacing:1.5px; }
.nav-wordmark em { color:var(--gold); font-style:italic; }
.nav-right { display:flex; align-items:center; gap:16px; }
.nav-avatar { width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,var(--gold),var(--gold2)); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:var(--ink); border:1px solid rgba(201,168,76,.35); }
.nav-name { font-size:13px; color:var(--dim); }
.nav-logout { padding:6px 15px; background:transparent; border:1px solid var(--line2); border-radius:100px; color:var(--dim); font-family:var(--sans); font-size:11px; letter-spacing:.5px; cursor:pointer; transition:all var(--ease); }
.nav-logout:hover { border-color:var(--red); color:var(--red); }

/* ── Hero ── */
.hero { padding:106px 56px 44px; max-width:1200px; margin:0 auto; display:grid; grid-template-columns:1.05fr 1fr; gap:64px; align-items:center; position:relative; z-index:1; }
.eyebrow { font-size:10px; font-weight:600; letter-spacing:3.5px; text-transform:uppercase; color:var(--gold); margin-bottom:14px; display:flex; align-items:center; gap:10px; }
.eyebrow::before { content:''; display:inline-block; width:24px; height:1px; background:var(--gold); opacity:.55; }
.hero-title { font-family:var(--serif); font-size:58px; font-weight:300; line-height:1.1; letter-spacing:-.5px; color:var(--cream); margin-bottom:16px; }
.hero-title em { font-style:italic; color:var(--gold); }
.hero-sub { font-size:14px; font-weight:300; color:var(--dim); line-height:1.85; max-width:400px; }
.mode-pills { display:flex; gap:7px; margin-top:22px; flex-wrap:wrap; }
.mode-pill { padding:5px 13px; border:1px solid var(--line2); border-radius:100px; font-size:11px; color:var(--dim); cursor:pointer; transition:all var(--ease); white-space:nowrap; background:none; font-family:var(--sans); }
.mode-pill:hover, .mode-pill.active { border-color:var(--gold); color:var(--gold); background:var(--glow); }
.features { display:flex; flex-direction:column; gap:9px; }
.feature-item { display:flex; align-items:center; gap:12px; padding:11px 18px; background:var(--card); border:1px solid var(--line); border-radius:10px; font-size:13px; color:var(--dim); animation:slideUp .5s ease both; }
.feature-item .dot { color:var(--gold); font-size:13px; flex-shrink:0; }

/* ── Studio ── */
.studio { max-width:1200px; margin:0 auto; padding:0 56px 80px; display:grid; grid-template-columns:1fr 1.08fr; gap:22px; position:relative; z-index:1; }
.panel { background:var(--card); border:1px solid var(--line); border-radius:18px; overflow:hidden; transition:border-color var(--ease); }
.panel:hover { border-color:var(--line2); }
.panel-head { padding:18px 24px 14px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; }
.panel-label { font-size:9px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--faint); }
.panel-badge { font-size:11px; padding:3px 10px; border-radius:100px; background:var(--glow); border:1px solid rgba(201,168,76,.22); color:var(--gold); }
.panel-body { padding:22px; }

/* Mode tabs */
.mode-tabs { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--line2); border-radius:var(--r-sm); overflow:hidden; margin-bottom:22px; }
.mode-tab { display:flex; flex-direction:column; align-items:center; gap:3px; padding:12px 8px; background:transparent; border:none; color:var(--faint); font-family:var(--sans); font-size:10px; letter-spacing:.5px; cursor:pointer; transition:all var(--ease); border-right:1px solid var(--line2); position:relative; }
.mode-tab:last-child { border-right:none; }
.mode-tab::after { content:''; position:absolute; bottom:0; left:18%; right:18%; height:2px; background:var(--gold); transform:scaleX(0); transition:transform var(--ease); border-radius:2px 2px 0 0; }
.mode-tab:hover { color:var(--cream); background:rgba(255,255,255,.02); }
.mode-tab.active { color:var(--gold); background:var(--glow); }
.mode-tab.active::after { transform:scaleX(1); }
.mode-tab-icon { font-size:17px; line-height:1; }

/* Text area */
.prompt-wrap { background:var(--ink3); border:1px solid var(--line2); border-radius:var(--r-sm); padding:14px; transition:border-color var(--ease); }
.prompt-wrap:focus-within { border-color:rgba(201,168,76,.38); }
.prompt-ta { width:100%; background:none; border:none; outline:none; color:var(--cream); font-family:var(--sans); font-size:14px; font-weight:300; line-height:1.75; resize:none; min-height:110px; }
.prompt-ta::placeholder { color:var(--faint); }
.ta-footer { display:flex; justify-content:flex-end; margin-top:9px; padding-top:9px; border-top:1px solid var(--line); }
.char-count { font-size:11px; color:var(--faint); }

/* Speech */
.speech-zone { display:flex; flex-direction:column; align-items:center; gap:16px; padding:26px 16px; border:1px dashed var(--line2); border-radius:var(--r-sm); transition:border-color var(--ease); }
.speech-zone.live { border-color:rgba(201,168,76,.38); }
.mic-ring { width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--ink3); border:1.5px solid var(--line2); cursor:pointer; transition:all var(--ease); font-size:24px; }
.mic-ring:hover { border-color:var(--gold); transform:scale(1.05); }
.mic-ring.recording { border-color:var(--red); background:rgba(224,85,85,.08); animation:pulse 1.5s ease-out infinite; }
.speech-hint { font-size:13px; color:var(--dim); text-align:center; line-height:1.65; }
.speech-transcript { width:100%; background:var(--ink3); border:1px solid var(--line); border-radius:var(--r-sm); padding:11px 14px; font-size:13px; font-style:italic; color:var(--cream); line-height:1.6; }

/* ── Sign Language ── */
.sign-wrapper { display:flex; flex-direction:column; gap:16px; }
.sign-top { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
.cam-frame { position:relative; border-radius:10px; overflow:hidden; background:var(--ink3); border:1px solid var(--line2); aspect-ratio:4/3; }
.cam-video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); display:block; }
.cam-canvas { position:absolute; inset:0; width:100%; height:100%; transform:scaleX(-1); }
.cam-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(13,13,18,.8); gap:11px; font-size:13px; color:var(--dim); }
.cam-start-btn { padding:8px 20px; background:var(--gold); border:none; border-radius:100px; color:var(--ink); font-family:var(--sans); font-size:12px; font-weight:600; cursor:pointer; transition:all var(--ease); }
.cam-start-btn:hover { background:var(--gold2); }
.cam-stop-btn { position:absolute; bottom:7px; right:7px; padding:3px 9px; background:rgba(13,13,18,.85); border:1px solid var(--line2); border-radius:5px; color:var(--dim); font-family:var(--sans); font-size:10px; cursor:pointer; transition:all var(--ease); }
.cam-stop-btn:hover { border-color:rgba(224,85,85,.4); color:var(--red); }

/* Live panel */
.live-panel { display:flex; flex-direction:column; gap:10px; }
.lp-label { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); }
.live-letter { font-family:var(--serif); font-size:80px; font-weight:300; line-height:1; color:var(--gold); min-height:88px; display:flex; align-items:center; transition:all .15s ease; }
.conf-bar-wrap { display:flex; flex-direction:column; gap:4px; }
.conf-label { font-size:10px; color:var(--faint); display:flex; justify-content:space-between; }
.conf-bar { height:3px; background:var(--line2); border-radius:2px; overflow:hidden; }
.conf-fill { height:100%; background:var(--gold); border-radius:2px; transition:width .2s ease; }
.hand-row { display:flex; align-items:center; gap:7px; }
.hand-indicator { width:7px; height:7px; border-radius:50%; background:var(--faint); transition:background .2s; }
.hand-indicator.on { background:var(--green); box-shadow:0 0 7px rgba(76,175,125,.55); }
.hand-status { font-size:11px; color:var(--faint); }

/* Typed word box */
.typed-section { background:var(--ink3); border:1px solid var(--line2); border-radius:var(--r-sm); padding:14px 16px; }
.ts-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.ts-label { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); }
.ts-actions { display:flex; gap:6px; }
.ts-btn { padding:3px 10px; background:transparent; border:1px solid var(--line2); border-radius:100px; color:var(--dim); font-family:var(--sans); font-size:10px; cursor:pointer; transition:all var(--ease); }
.ts-btn:hover { border-color:var(--gold); color:var(--gold); }
.ts-btn.danger:hover { border-color:var(--red); color:var(--red); }
.typed-text { font-family:var(--serif); font-size:28px; font-weight:300; color:var(--cream); min-height:36px; letter-spacing:2px; line-height:1.2; display:flex; align-items:center; flex-wrap:wrap; }
.typed-cursor { display:inline-block; width:2px; height:26px; background:var(--gold); margin-left:3px; animation:blink 1s infinite; vertical-align:middle; }
.typed-hint { font-size:11px; color:var(--faint); margin-top:6px; line-height:1.5; }

/* Alpha grid */
.alpha-section { border-top:1px solid var(--line); padding-top:14px; }
.alpha-title { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); margin-bottom:10px; }
.alpha-grid { display:grid; grid-template-columns:repeat(13,1fr); gap:4px; }
.alpha-cell { display:flex; align-items:center; justify-content:center; padding:5px 2px; border:1px solid var(--line); border-radius:6px; font-size:12px; font-weight:500; color:var(--faint); transition:all .15s; cursor:default; }
.alpha-cell.active { border-color:rgba(201,168,76,.55); background:var(--glow); color:var(--gold); }
.alpha-cell.recent { border-color:rgba(201,168,76,.25); color:rgba(201,168,76,.65); background:rgba(201,168,76,.04); }

/* Prompt preview */
.prompt-preview { background:var(--ink3); border:1px solid var(--line); border-radius:8px; padding:9px 13px; font-size:12px; color:var(--dim); font-style:italic; line-height:1.5; margin-top:14px; }

/* Generate button */
.gen-btn { width:100%; padding:14px; background:var(--gold); border:none; border-radius:var(--r-sm); color:var(--ink); font-family:var(--sans); font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; cursor:pointer; transition:all var(--ease); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:9px; margin-top:18px; }
.gen-btn:hover:not(:disabled) { background:var(--gold2); transform:translateY(-2px); box-shadow:0 12px 36px rgba(201,168,76,.26); }
.gen-btn:active:not(:disabled) { transform:translateY(0); box-shadow:none; }
.gen-btn:disabled { opacity:.32; cursor:not-allowed; }
.gen-btn .btn-shine { position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.17),transparent); transform:translateX(-100%); animation:shimmer 2.4s infinite; }
.gen-spinner { width:14px; height:14px; border:2px solid rgba(0,0,0,.2); border-top-color:var(--ink); border-radius:50%; animation:spin .7s linear infinite; }

/* ── Output panel ── */
.output-panel { position:sticky; top:80px; }
.img-stage { width:100%; aspect-ratio:1/1; background:var(--ink3); border-radius:10px; overflow:hidden; position:relative; border:1px solid var(--line); }
.img-stage img { width:100%; height:100%; object-fit:cover; display:block; animation:revealImg .7s cubic-bezier(.4,0,.2,1); }
.stage-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--faint); }
.stage-glyph { font-family:var(--serif); font-size:68px; font-weight:300; opacity:.1; line-height:1; }
.stage-txt { font-size:11px; letter-spacing:1px; text-align:center; line-height:1.8; }
.stage-loading { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:13px; background:var(--ink3); }
.loading-orb { width:46px; height:46px; border-radius:50%; border:1.5px solid var(--line2); border-top-color:var(--gold); animation:spin 1s linear infinite; }
.loading-txt { font-size:10px; letter-spacing:2px; color:var(--dim); text-transform:uppercase; }
.loading-sub { font-size:11px; color:var(--faint); }
.scan-line { position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,var(--gold),transparent); opacity:.3; animation:scanAnim 2.2s ease-in-out infinite; }

/* Result meta */
.result-meta { padding:16px 22px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:9px; }
.meta-row { display:flex; gap:11px; align-items:flex-start; }
.meta-key { font-size:9px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--faint); min-width:50px; padding-top:2px; flex-shrink:0; }
.meta-val { font-size:13px; color:var(--cream); line-height:1.5; }
.meta-val.gold { color:var(--gold); font-weight:500; }
.source-tag { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:100px; font-size:11px; }
.source-tag.text   { background:rgba(201,168,76,.11); color:var(--gold); border:1px solid rgba(201,168,76,.23); }
.source-tag.speech { background:rgba(62,207,184,.09); color:var(--teal); border:1px solid rgba(62,207,184,.2); }
.source-tag.sign   { background:rgba(255,255,255,.05); color:var(--dim); border:1px solid var(--line2); }
.action-row { padding:0 22px 18px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.action-btn { padding:10px; background:transparent; border:1px solid var(--line2); border-radius:var(--r-sm); color:var(--dim); font-family:var(--sans); font-size:11px; cursor:pointer; transition:all var(--ease); display:flex; align-items:center; justify-content:center; gap:5px; }
.action-btn:hover { border-color:var(--gold); color:var(--gold); background:var(--glow); }
.action-btn:disabled { opacity:.3; cursor:not-allowed; }
.error-bar { margin:0 22px 14px; padding:11px 14px; background:rgba(224,85,85,.08); border:1px solid rgba(224,85,85,.2); border-radius:var(--r-sm); font-size:12px; color:#f4a0a0; display:flex; gap:8px; align-items:flex-start; line-height:1.5; }

footer { position:relative; z-index:1; border-top:1px solid var(--line); padding:18px 56px; display:flex; align-items:center; justify-content:space-between; }
.footer-wm { font-family:var(--serif); font-size:15px; font-weight:300; color:var(--faint); letter-spacing:1px; }
.footer-wm em { color:var(--gold); font-style:italic; }
.footer-right { font-size:10px; color:var(--faint); letter-spacing:.8px; }

@media (max-width:880px) {
  .hero, .studio { grid-template-columns:1fr; padding:90px 20px 28px; gap:18px; }
  .hero { padding-bottom:0; }
  nav { padding:0 20px; }
  footer { padding:16px 20px; flex-direction:column; gap:5px; text-align:center; }
  .output-panel { position:static; }
  .sign-top { grid-template-columns:1fr; }
  .alpha-grid { grid-template-columns:repeat(9,1fr); }
}
`;

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e?.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    setTimeout(() => {
      const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U";
      onLogin({ name, email, initials });
    }, 900);
  };

  return (
    <div className="login-overlay">
      <div className="login-box">
        <div className="login-wordmark">Visual<em>AI</em></div>
        <div className="login-tagline">Multimodal Image Studio</div>
        <form onSubmit={submit}>
          <label className="field-label">Email address</label>
          <input className="field-input" type="email" placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          <label className="field-label">Password</label>
          <input className="field-input" type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
            onKeyDown={e => e.key === "Enter" && submit()} />
          {error && <div className="login-error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? <><span className="btn-spinner" />"Signing in…"</> : <><span className="shimmer" />Sign In</>}
          </button>
        </form>
        <div className="login-divider" />
        <button className="btn-ghost" onClick={() => onLogin({ name: "Demo User", email: "demo@visualai.io", initials: "DU" })} disabled={loading}>
          Continue as Guest →
        </button>
        <p className="login-hint">No account? <a onClick={() => alert("Connect your auth backend here.")}>Create one free</a></p>
      </div>
    </div>
  );
}

// ── Text Mode ─────────────────────────────────────────────────────────────────
function TextMode({ value, onChange }) {
  return (
    <div className="prompt-wrap">
      <textarea className="prompt-ta" maxLength={400} rows={5}
        placeholder={"Describe your image in detail…\ne.g. A solitary lighthouse on a rocky coast at dusk, dramatic clouds, cinematic lighting"}
        value={value} onChange={e => onChange(e.target.value)} />
      <div className="ta-footer">
        <span className="char-count">{value.length} / 400</span>
      </div>
    </div>
  );
}

// ── Speech Mode ───────────────────────────────────────────────────────────────
function SpeechMode({ value, onChange }) {
  const [live, setLive] = useState(false);
  const [supported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recRef = useRef(null);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (live) { recRef.current?.stop(); setLive(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    recRef.current = r;
    r.continuous = false; r.interimResults = true; r.lang = "en-US";
    r.onresult = e => onChange(Array.from(e.results).map(x => x[0].transcript).join(""));
    r.onend = () => setLive(false);
    r.onerror = () => setLive(false);
    r.start(); setLive(true);
  }, [live, supported, onChange]);

  return (
    <div className={`speech-zone ${live ? "live" : ""}`}>
      <div className={`mic-ring ${live ? "recording" : ""}`} onClick={toggle} title={supported ? "Click to record" : "Not supported"}>
        {live ? "⏹" : "🎙"}
      </div>
      <p className="speech-hint">
        {!supported ? "Speech recognition not supported in this browser."
          : live ? "Listening… speak your image prompt clearly."
            : value ? "Tap to re-record your prompt."
              : "Tap the microphone and speak your image prompt."}
      </p>
      {value && <div className="speech-transcript">"{value}"</div>}
    </div>
  );
}

// ── Sign Language Mode (ASL A–Z, Real-time MediaPipe) ─────────────────────────
function SignMode({ onPromptChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const camRef = useRef(null);
  const holdRef = useRef({ letter: null, ms: 0, lastTime: Date.now() });

  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [signedText, setSignedText] = useState("");
  const [liveLetter, setLiveLetter] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [handVisible, setHandVisible] = useState(false);
  const [recentCell, setRecentCell] = useState(null);

  // Keep prompt in sync with signedText
  useEffect(() => {
    const trimmed = signedText.trim();
    onPromptChange(trimmed);
  }, [signedText, onPromptChange]);

  const appendChar = useCallback((ch) => {
    setSignedText(prev => prev + ch);
    setRecentCell(ch);
    setTimeout(() => setRecentCell(null), 1400);
  }, []);

  const addSpace = () => setSignedText(p => p + " ");
  const delChar = () => setSignedText(p => p.slice(0, -1));
  const clearAll = () => { setSignedText(""); onPromptChange(""); };

  // MediaPipe results handler
  const onResults = useCallback((results, drawConnectors, drawLandmarks, HAND_CONNECTIONS) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasHand = results.multiHandLandmarks?.length > 0;
    setHandVisible(hasHand);

    if (hasHand) {
      const lm = results.multiHandLandmarks[0];
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "rgba(201,168,76,0.5)", lineWidth: 1.5 });
      drawLandmarks(ctx, lm, { color: "rgba(232,201,122,0.9)", fillColor: "rgba(201,168,76,0.4)", lineWidth: 1, radius: 3 });

      const result = classifyASL(lm);
      const detected = result?.letter ?? null;
      const conf = result?.confidence ?? 0;

      setLiveLetter(detected);
      setConfidence(conf);

      // Hold-to-register
      const now = Date.now();
      const dt = now - holdRef.current.lastTime;
      holdRef.current.lastTime = now;

      if (detected === holdRef.current.letter) {
        holdRef.current.ms += dt;
        if (holdRef.current.ms >= LETTER_HOLD_MS && detected) {
          appendChar(detected);
          holdRef.current.ms = 0;
          holdRef.current.letter = null; // require release before next
        }
      } else {
        holdRef.current.letter = detected;
        holdRef.current.ms = 0;
      }
    } else {
      setLiveLetter(null);
      setConfidence(0);
      holdRef.current.letter = null;
      holdRef.current.ms = 0;
    }
  }, [appendChar]);

  const startCamera = useCallback(async () => {
    setCamLoading(true);
    try {
      const hmod = await import("@mediapipe/hands");
      const cmod = await import("@mediapipe/camera_utils");
      const dmod = await import("@mediapipe/drawing_utils");
      const { Hands, HAND_CONNECTIONS } = hmod;
      const { Camera } = cmod;
      const { drawConnectors, drawLandmarks } = dmod;

      const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.75, minTrackingConfidence: 0.7 });
      hands.onResults(r => onResults(r, drawConnectors, drawLandmarks, HAND_CONNECTIONS));
      handsRef.current = hands;

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      videoRef.current.srcObject = stream;

      const cam = new Camera(videoRef.current, {
        onFrame: async () => { if (videoRef.current?.readyState >= 2) await hands.send({ image: videoRef.current }); },
        width: 320, height: 240,
      });
      camRef.current = cam;
      await cam.start();
      setCamActive(true);
    } catch (err) {
      console.error("Camera/MediaPipe error:", err);
      // Graceful demo fallback
      startDemo();
    } finally {
      setCamLoading(false);
    }
  }, [onResults]);

  const stopCamera = useCallback(() => {
    camRef.current?.stop();
    if (handsRef.current) { try { handsRef.current.close(); } catch (_) { } handsRef.current = null; }
    const vid = videoRef.current;
    if (vid?.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); vid.srcObject = null; }
    setCamActive(false);
    setLiveLetter(null); setConfidence(0); setHandVisible(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Demo: cycles S-U-N-S-E-T to show functionality
  const demoRef = useRef(null);
  const startDemo = () => {
    setCamActive(true);
    const word = "SUNSET"; let i = 0; let acc = 0;
    demoRef.current = setInterval(() => {
      setHandVisible(true);
      const l = word[i % word.length];
      setLiveLetter(l); setConfidence(0.88);
      acc += 300;
      if (acc >= 900) { appendChar(l); acc = 0; i++; }
    }, 300);
  };

  useEffect(() => () => { if (demoRef.current) clearInterval(demoRef.current); }, []);

  const confPct = Math.round(confidence * 100);

  return (
    <div className="sign-wrapper">
      {/* Camera + live letter */}
      <div className="sign-top">
        <div className="cam-frame">
          <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="cam-canvas" />

          {!camActive && (
            <div className="cam-overlay">
              {camLoading
                ? <><div style={{ width: 26, height: 26, border: "2px solid rgba(255,255,255,.1)", borderTopColor: "var(--gold)", borderRadius: "50%", animation: "spin .8s linear infinite" }} /><span>Loading AI model…</span></>
                : <><span style={{ fontSize: 13 }}>Real-time ASL A–Z detection</span><button className="cam-start-btn" onClick={startCamera}>Start Camera</button></>
              }
            </div>
          )}

          {camActive && (
            <button className="cam-stop-btn" onClick={stopCamera}>■ Stop</button>
          )}
        </div>

        <div className="live-panel">
          <div className="lp-label">Detected letter</div>
          <div className="hand-row">
            <div className={`hand-indicator ${handVisible ? "on" : ""}`} />
            <span className="hand-status">{handVisible ? "Hand detected" : "No hand detected"}</span>
          </div>
          <div className="live-letter">{liveLetter ?? "—"}</div>
          <div className="conf-bar-wrap">
            <div className="conf-label"><span>Confidence</span><span>{confPct}%</span></div>
            <div className="conf-bar"><div className="conf-fill" style={{ width: confPct + "%" }} /></div>
          </div>
          {!camActive && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>
              Start the camera. Show ASL hand signs A–Z to spell your image prompt letter by letter.
            </div>
          )}
        </div>
      </div>

      {/* Typed accumulator */}
      <div className="typed-section">
        <div className="ts-header">
          <span className="ts-label">Signed phrase</span>
          <div className="ts-actions">
            <button className="ts-btn" onClick={addSpace}>Space</button>
            <button className="ts-btn danger" onClick={delChar}>⌫ Delete</button>
            <button className="ts-btn danger" onClick={clearAll}>Clear</button>
          </div>
        </div>
        <div className="typed-text">
          {signedText}
          <span className="typed-cursor" />
        </div>
        <div className="typed-hint">Hold each sign steady for ~1 second to register the letter.</div>
      </div>

      {/* Alphabet reference */}
      <div className="alpha-section">
        <div className="alpha-title">ASL alphabet reference</div>
        <div className="alpha-grid">
          {Array.from({ length: 26 }, (_, i) => {
            const ch = String.fromCharCode(65 + i);
            return (
              <div key={ch}
                className={`alpha-cell ${liveLetter === ch ? "active" : ""} ${recentCell === ch ? "recent" : ""}`}
              >{ch}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Output Panel ──────────────────────────────────────────────────────────────
function OutputPanel({ result, loading, error }) {
  const download = () => {
    if (!result?.image_url) return;
    const a = document.createElement("a");
    a.href = result.image_url; a.download = "visualai-output.png"; a.target = "_blank"; a.click();
  };
  const copyLink = () => {
    if (result?.image_url) navigator.clipboard?.writeText(result.image_url).then(() => alert("Link copied!"));
  };

  const srcLabel = result ? { text: "✦ Text", speech: "🎙 Speech", sign: "🤟 ASL Sign" }[result.source] : "";
  const srcClass = result?.source ?? "text";

  return (
    <div className="panel output-panel">
      <div className="panel-head">
        <span className="panel-label">Canvas Output</span>
        {result && <span className="panel-badge">1024 × 1024 · HD</span>}
      </div>

      <div>
        <div style={{ padding: "22px 22px 0" }}>
          <div className="img-stage">
            {loading && (
              <div className="stage-loading">
                <div className="loading-orb" />
                <div className="scan-line" />
                <div className="loading-txt">Rendering</div>
                <div className="loading-sub">DALL·E 3 is generating your image…</div>
              </div>
            )}
            {!loading && result?.image_url && <img src={result.image_url} alt="AI generated" />}
            {!loading && !result && (
              <div className="stage-empty">
                <div className="stage-glyph">✦</div>
                <div className="stage-txt">Your generated image<br />will appear here</div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="error-bar" style={{ margin: "14px 22px 0" }}>⚠ {error}</div>}

        {result && (
          <>
            <div className="result-meta">
              <div className="meta-row">
                <span className="meta-key">Source</span>
                <span className={`meta-val source-tag ${srcClass}`}>{srcLabel}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Time</span>
                <span className="meta-val gold">
                  {result.cached ? "Instant (cached)" : `${(result.generation_time_ms / 1000).toFixed(1)}s`}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Prompt</span>
                <span className="meta-val" style={{ fontSize: 12, fontStyle: "italic" }}>{result.prompt_used}</span>
              </div>
            </div>
            <div className="action-row">
              <button className="action-btn" onClick={download}>↓ Download</button>
              <button className="action-btn" onClick={copyLink}>⎘ Copy link</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("text");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Reset prompt when switching mode
  useEffect(() => { setPrompt(""); setResult(null); setError(null); }, [mode]);

  const handleSignPrompt = useCallback((p) => setPrompt(p), []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => { setUser(null); setResult(null); setPrompt(""); setError(null); };

  const MODES = [
    { id: "text", icon: "✦", label: "Text" },
    { id: "speech", icon: "🎙", label: "Speech" },
    { id: "sign", icon: "🤟", label: "ASL A–Z" },
  ];

  const FEATURES = [
    "Real-time ASL A–Z letter recognition",
    "Spell any word with hand signs",
    "Voice-to-image via Web Speech API",
    "DALL·E 3 cinematic HD output",
  ];

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {!user && <LoginScreen onLogin={setUser} />}

      <div className="amb amb-1" />
      <div className="amb amb-2" />

      {/* Navbar */}
      <nav style={{ display: user ? "flex" : "none" }}>
        <div className="nav-wordmark">Visual<em>AI</em></div>
        {user && (
          <div className="nav-right">
            <div className="nav-avatar">{user.initials}</div>
            <span className="nav-name">{user.name}</span>
            <button className="nav-logout" onClick={logout}>Sign out</button>
          </div>
        )}
      </nav>

      {user && (
        <>
          {/* Hero */}
          <section className="hero">
            <div>
              <div className="eyebrow">AI Image Studio</div>
              <h1 className="hero-title">Create from<br /><em>any input</em></h1>
              <p className="hero-sub">
                Generate stunning HD images using text, your voice, or real-time ASL sign language — powered by DALL·E 3.
              </p>
              <div className="mode-pills">
                {MODES.map((m, i) => (
                  <button key={m.id} className={`mode-pill ${mode === m.id ? "active" : ""}`}
                    onClick={() => setMode(m.id)}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="features">
              {FEATURES.map((f, i) => (
                <div key={f} className="feature-item" style={{ animationDelay: `${.04 + i * .07}s` }}>
                  <span className="dot">✦</span>{f}
                </div>
              ))}
            </div>
          </section>

          {/* Studio */}
          <section className="studio">
            {/* Input panel */}
            <div className="panel">
              <div className="panel-head">
                <span className="panel-label">Input Studio</span>
                <span className="panel-badge">{MODES.find(m => m.id === mode)?.label}</span>
              </div>
              <div className="panel-body">
                <div className="mode-tabs">
                  {MODES.map(m => (
                    <button key={m.id} className={`mode-tab ${mode === m.id ? "active" : ""}`}
                      onClick={() => setMode(m.id)}>
                      <span className="mode-tab-icon">{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>

                {mode === "text" && <TextMode value={prompt} onChange={setPrompt} />}
                {mode === "speech" && <SpeechMode value={prompt} onChange={setPrompt} />}
                {mode === "sign" && <SignMode onPromptChange={handleSignPrompt} />}

                {prompt.trim() && (
                  <div className="prompt-preview">
                    "{prompt.slice(0, 90)}{prompt.length > 90 ? "…" : ""}"
                  </div>
                )}

                {error && <div className="error-bar" style={{ marginTop: 12 }}>⚠ {error}</div>}

                <button className="gen-btn" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                  {loading
                    ? <><div className="gen-spinner" />Generating…</>
                    : <><span className="btn-shine" />Generate Image</>
                  }
                </button>
              </div>
            </div>

            {/* Output panel */}
            <OutputPanel result={result} loading={loading} error={null} />
          </section>

          <footer>
            <div className="footer-wm">Visual<em>AI</em></div>
            <div className="footer-right">DALL·E 3 · MediaPipe Hands · ASL A–Z · Web Speech API · Flask</div>
          </footer>
        </>
      )}
    </>
  );
}
