/**
 * VisualAI — App.jsx v2.0
 * Complete overhaul: improved UI, ASL recorder, dataset viewer, better UX
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { classifyASL, resetHistory, loadTrainedModel, isModelLoaded, getModelError } from "./aslClassifier.js";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";
const LETTER_HOLD_MS = 800;
const LETTER_CONF_THRESHOLD = 0.62;

// ── Global CSS ─────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --ink:   #080810;
  --ink2:  #0e0e1a;
  --ink3:  #161622;
  --card:  #1a1a28;
  --card2: #20202e;
  --line:  rgba(255,255,255,0.055);
  --line2: rgba(255,255,255,0.10);
  --gold:  #c9a84c;
  --gold2: #e8c97a;
  --glow:  rgba(201,168,76,0.12);
  --cream: #f0ebe2;
  --dim:   #9b9480;
  --faint: #42403a;
  --teal:  #3ecfb8;
  --red:   #e05555;
  --green: #4caf7d;
  --blue:  #5b8dee;
  --serif: 'Cormorant Garamond', Georgia, serif;
  --sans:  'Outfit', sans-serif;
  --ease:  0.22s cubic-bezier(0.4,0,0.2,1);
  --r:     14px;
  --rsm:   9px;
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

body::after {
  content: '';
  position: fixed; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none; z-index: 9000; opacity: .45;
}

/* Ambient glows */
.amb { position:fixed; pointer-events:none; z-index:0; border-radius:50%; filter:blur(140px); }
.amb-1 { width:900px; height:700px; top:-300px; left:50%; transform:translateX(-50%); background:rgba(201,168,76,0.04); }
.amb-2 { width:400px; height:400px; bottom:80px; right:-120px; background:rgba(62,207,184,0.03); }
.amb-3 { width:300px; height:300px; top:40%; left:-80px; background:rgba(91,141,238,0.025); }

/* Animations */
@keyframes fadeIn  { from{opacity:0} to{opacity:1} }
@keyframes slideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
@keyframes spin    { to{transform:rotate(360deg)} }
@keyframes shimmer { 100%{transform:translateX(220%)} }
@keyframes pulse   { 0%{box-shadow:0 0 0 0 rgba(224,85,85,.45)} 70%{box-shadow:0 0 0 18px rgba(224,85,85,0)} 100%{box-shadow:0 0 0 0 rgba(224,85,85,0)} }
@keyframes scan    { 0%{top:0} 50%{top:100%} 100%{top:0} }
@keyframes reveal  { from{opacity:0;transform:scale(1.04)} to{opacity:1;transform:scale(1)} }
@keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes glow    { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0)} 50%{box-shadow:0 0 22px 4px rgba(201,168,76,0.18)} }
@keyframes pop     { 0%{transform:scale(1)} 40%{transform:scale(1.18)} 100%{transform:scale(1)} }

/* ── Login ── */
.login-overlay {
  position:fixed; inset:0; z-index:1000;
  background:var(--ink);
  display:flex; align-items:center; justify-content:center;
  animation:fadeIn .5s ease;
}
.login-box {
  width:440px;
  background:var(--card);
  border:1px solid var(--line2);
  border-radius:24px;
  padding:52px 44px;
  position:relative; overflow:hidden;
  animation:slideUp .55s .1s ease both;
}
.login-box::before {
  content:'';
  position:absolute; top:0; left:0; right:0; height:1px;
  background:linear-gradient(90deg,transparent,var(--gold),transparent);
  opacity:.55;
}
.login-wordmark { font-family:var(--serif); font-size:42px; font-weight:300; letter-spacing:2px; text-align:center; margin-bottom:4px; }
.login-wordmark em { color:var(--gold); font-style:italic; }
.login-tagline { text-align:center; font-size:11px; font-weight:300; color:var(--dim); letter-spacing:3.5px; text-transform:uppercase; margin-bottom:44px; }
.field-label { display:block; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--dim); margin-bottom:7px; }
.field-input {
  width:100%; padding:13px 16px;
  background:var(--ink3); border:1px solid var(--line2); border-radius:var(--rsm);
  color:var(--cream); font-family:var(--sans); font-size:14px; outline:none;
  transition:border-color var(--ease); margin-bottom:14px;
}
.field-input:focus { border-color:rgba(201,168,76,.5); }
.field-input::placeholder { color:var(--faint); }
.login-error { font-size:12px; color:var(--red); margin-bottom:10px; }
.btn-primary {
  width:100%; padding:14px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  border:none; border-radius:var(--rsm);
  color:var(--ink); font-family:var(--sans); font-size:13px; font-weight:700;
  letter-spacing:1.2px; text-transform:uppercase; cursor:pointer;
  transition:all var(--ease); position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center; gap:8px;
}
.btn-primary:hover { transform:translateY(-2px); box-shadow:0 12px 36px rgba(201,168,76,.28); }
.btn-primary .shimmer { position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent); transform:translateX(-100%); animation:shimmer 2.4s infinite; }
.login-divider { height:1px; background:var(--line); margin:22px 0; position:relative; }
.login-divider::after { content:'or'; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:var(--card); padding:0 12px; font-size:11px; color:var(--faint); letter-spacing:1px; }
.btn-ghost { width:100%; padding:13px; background:transparent; border:1px solid var(--line2); border-radius:var(--rsm); color:var(--dim); font-family:var(--sans); font-size:13px; cursor:pointer; transition:all var(--ease); }
.btn-ghost:hover { background:var(--card2); color:var(--cream); border-color:rgba(201,168,76,.3); }
.login-hint { font-size:12px; color:var(--faint); text-align:center; margin-top:14px; }
.btn-spinner { width:14px; height:14px; border:2px solid rgba(0,0,0,.2); border-top-color:var(--ink); border-radius:50%; animation:spin .7s linear infinite; }

/* ── Navbar ── */
nav {
  position:fixed; top:0; left:0; right:0; z-index:100;
  height:62px; display:flex; align-items:center; justify-content:space-between;
  padding:0 48px;
  background:rgba(8,8,16,.92); backdrop-filter:blur(24px);
  border-bottom:1px solid var(--line);
}
.nav-wordmark { font-family:var(--serif); font-size:22px; font-weight:300; letter-spacing:1.5px; }
.nav-wordmark em { color:var(--gold); font-style:italic; }
.nav-tabs { display:flex; gap:4px; }
.nav-tab { padding:7px 16px; background:transparent; border:1px solid transparent; border-radius:100px; color:var(--dim); font-family:var(--sans); font-size:12px; font-weight:500; cursor:pointer; transition:all var(--ease); }
.nav-tab:hover { color:var(--cream); background:rgba(255,255,255,.05); }
.nav-tab.active { border-color:rgba(201,168,76,.35); color:var(--gold); background:var(--glow); }
.nav-right { display:flex; align-items:center; gap:14px; }
.nav-avatar { width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,var(--gold),var(--gold2)); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:var(--ink); }
.nav-name { font-size:13px; color:var(--dim); }
.nav-logout { padding:6px 15px; background:transparent; border:1px solid var(--line2); border-radius:100px; color:var(--dim); font-family:var(--sans); font-size:11px; cursor:pointer; transition:all var(--ease); }
.nav-logout:hover { border-color:var(--red); color:var(--red); }

/* ── Page shell ── */
.page { padding-top: 62px; min-height: 100vh; position: relative; z-index: 1; }

/* ── Studio Page ── */
.studio-wrap { max-width:1260px; margin:0 auto; padding:48px 48px 80px; display:grid; grid-template-columns:1fr 1.1fr; gap:24px; }
.studio-header { grid-column:1/-1; margin-bottom:8px; }
.studio-title { font-family:var(--serif); font-size:36px; font-weight:300; letter-spacing:-.3px; }
.studio-title em { color:var(--gold); font-style:italic; }
.studio-sub { font-size:13px; color:var(--dim); margin-top:6px; }

.panel { background:var(--card); border:1px solid var(--line); border-radius:18px; overflow:hidden; transition:border-color var(--ease); }
.panel:hover { border-color:var(--line2); }
.panel-head { padding:16px 22px 13px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; }
.panel-label { font-size:9px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--faint); }
.panel-badge { font-size:11px; padding:3px 10px; border-radius:100px; background:var(--glow); border:1px solid rgba(201,168,76,.22); color:var(--gold); }
.panel-body { padding:22px; }

/* Mode tabs */
.mode-tabs { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--line2); border-radius:var(--rsm); overflow:hidden; margin-bottom:22px; }
.mode-tab { display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:transparent; border:none; border-right:1px solid var(--line2); color:var(--faint); font-family:var(--sans); font-size:10px; letter-spacing:.5px; cursor:pointer; transition:all var(--ease); }
.mode-tab:last-child { border-right:none; }
.mode-tab.active { color:var(--gold); background:var(--glow); }
.mode-tab-icon { font-size:18px; line-height:1; }

/* Text mode */
.prompt-wrap { background:var(--ink3); border:1px solid var(--line2); border-radius:var(--rsm); padding:14px; transition:border-color var(--ease); }
.prompt-wrap:focus-within { border-color:rgba(201,168,76,.38); }
.prompt-ta { width:100%; background:none; border:none; outline:none; color:var(--cream); font-family:var(--sans); font-size:14px; font-weight:300; line-height:1.75; resize:none; min-height:110px; }
.prompt-ta::placeholder { color:var(--faint); }
.ta-footer { display:flex; justify-content:flex-end; margin-top:9px; padding-top:9px; border-top:1px solid var(--line); }
.char-count { font-size:11px; color:var(--faint); }

/* Speech mode */
.speech-zone { display:flex; flex-direction:column; align-items:center; gap:16px; padding:28px 16px; border:1px dashed var(--line2); border-radius:var(--rsm); transition:border-color var(--ease); }
.speech-zone.live { border-color:rgba(224,85,85,.4); }
.mic-ring { width:76px; height:76px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--ink3); border:1.5px solid var(--line2); cursor:pointer; transition:all var(--ease); font-size:26px; }
.mic-ring:hover { border-color:var(--gold); transform:scale(1.06); }
.mic-ring.recording { border-color:var(--red); background:rgba(224,85,85,.08); animation:pulse 1.5s infinite; }
.speech-hint { font-size:13px; color:var(--dim); text-align:center; line-height:1.65; }
.speech-transcript { width:100%; background:var(--ink3); border:1px solid var(--line); border-radius:var(--rsm); padding:12px 16px; font-size:13px; font-style:italic; color:var(--cream); }

/* Sign mode */
.sign-wrapper { display:flex; flex-direction:column; gap:16px; }
.sign-top { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
.cam-frame { position:relative; border-radius:12px; overflow:hidden; background:var(--ink3); border:1px solid var(--line2); aspect-ratio:4/3; }
.cam-video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); display:block; }
.cam-canvas { position:absolute; inset:0; width:100%; height:100%; transform:scaleX(-1); }
.cam-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(8,8,16,.82); gap:12px; font-size:13px; color:var(--dim); }
.cam-start-btn { padding:9px 22px; background:linear-gradient(135deg,var(--gold),var(--gold2)); border:none; border-radius:100px; color:var(--ink); font-family:var(--sans); font-size:12px; font-weight:700; cursor:pointer; transition:all var(--ease); }
.cam-start-btn:hover { transform:scale(1.04); }
.cam-stop-btn { position:absolute; bottom:8px; right:8px; padding:4px 10px; background:rgba(8,8,16,.88); border:1px solid var(--line2); border-radius:6px; color:var(--dim); font-family:var(--sans); font-size:10px; cursor:pointer; transition:all var(--ease); }
.cam-stop-btn:hover { border-color:rgba(224,85,85,.5); color:var(--red); }

/* Live letter panel */
.live-panel { display:flex; flex-direction:column; gap:12px; }
.lp-label { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); }
.live-letter { font-family:var(--serif); font-size:88px; font-weight:300; line-height:1; color:var(--gold); min-height:96px; display:flex; align-items:center; transition:all .12s ease; }
.live-letter.pop { animation:pop .2s ease; }
.conf-bar-wrap { display:flex; flex-direction:column; gap:5px; }
.conf-label { font-size:10px; color:var(--faint); display:flex; justify-content:space-between; }
.conf-bar { height:4px; background:var(--line2); border-radius:2px; overflow:hidden; }
.conf-fill { height:100%; background:linear-gradient(90deg,var(--gold),var(--gold2)); border-radius:2px; transition:width .18s ease; }
.hand-row { display:flex; align-items:center; gap:7px; }
.hand-indicator { width:8px; height:8px; border-radius:50%; background:var(--faint); transition:background .2s; }
.hand-indicator.on { background:var(--green); box-shadow:0 0 8px rgba(76,175,125,.6); }
.hand-status { font-size:11px; color:var(--faint); }
.debug-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:2px; margin-top:4px; }
.debug-cell { padding:2px 0; border-radius:3px; font-size:9px; color:var(--dim); text-align:center; background:var(--ink3); }
.debug-cell.hi { background:rgba(201,168,76,.18); color:var(--gold); font-weight:600; }

/* Typed text */
.typed-section { background:var(--ink3); border:1px solid var(--line2); border-radius:var(--rsm); padding:14px 16px; }
.ts-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.ts-label { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); }
.ts-actions { display:flex; gap:6px; }
.ts-btn { padding:4px 11px; background:transparent; border:1px solid var(--line2); border-radius:100px; color:var(--dim); font-family:var(--sans); font-size:10px; cursor:pointer; transition:all var(--ease); }
.ts-btn:hover { border-color:var(--gold); color:var(--gold); }
.ts-btn.danger:hover { border-color:var(--red); color:var(--red); }
.typed-text { font-family:var(--serif); font-size:30px; font-weight:300; color:var(--cream); min-height:38px; letter-spacing:2px; line-height:1.2; display:flex; align-items:center; flex-wrap:wrap; overflow:hidden; }
.typed-cursor { display:inline-block; width:2px; height:28px; background:var(--gold); margin-left:3px; animation:blink 1s infinite; vertical-align:middle; }
.typed-hint { font-size:11px; color:var(--faint); margin-top:6px; }

/* Alphabet reference grid */
.alpha-section { border-top:1px solid var(--line); padding-top:14px; }
.alpha-title { font-size:9px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--faint); margin-bottom:10px; }
.alpha-grid { display:grid; grid-template-columns:repeat(13,1fr); gap:4px; }
.alpha-cell { display:flex; align-items:center; justify-content:center; padding:5px 2px; border:1px solid var(--line); border-radius:6px; font-size:12px; font-weight:500; color:var(--faint); transition:all .12s; }
.alpha-cell.active { border-color:rgba(201,168,76,.6); background:var(--glow); color:var(--gold); animation:glow .4s ease; }
.alpha-cell.recent { border-color:rgba(201,168,76,.28); color:rgba(201,168,76,.7); background:rgba(201,168,76,.05); }

/* Prompt preview + generate */
.prompt-preview { background:var(--ink3); border:1px solid var(--line); border-radius:8px; padding:10px 14px; font-size:12px; color:var(--dim); font-style:italic; margin-top:14px; }
.gen-btn {
  width:100%; padding:15px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  border:none; border-radius:var(--rsm);
  color:var(--ink); font-family:var(--sans); font-size:12px; font-weight:700;
  letter-spacing:1.5px; text-transform:uppercase; cursor:pointer;
  transition:all var(--ease); position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center; gap:9px; margin-top:18px;
}
.gen-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 40px rgba(201,168,76,.3); }
.gen-btn:disabled { opacity:.3; cursor:not-allowed; }
.gen-btn .btn-shine { position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent); transform:translateX(-100%); animation:shimmer 2.4s infinite; }
.gen-spinner { width:14px; height:14px; border:2px solid rgba(0,0,0,.2); border-top-color:var(--ink); border-radius:50%; animation:spin .7s linear infinite; }

/* Output panel */
.output-panel { position:sticky; top:80px; }
.img-stage { width:100%; aspect-ratio:1/1; background:var(--ink3); border-radius:12px; overflow:hidden; position:relative; border:1px solid var(--line); }
.img-stage img { width:100%; height:100%; object-fit:cover; display:block; animation:reveal .7s cubic-bezier(.4,0,.2,1); }
.stage-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--faint); }
.stage-glyph { font-family:var(--serif); font-size:72px; font-weight:300; opacity:.1; }
.stage-txt { font-size:11px; letter-spacing:1px; text-align:center; line-height:1.8; }
.stage-loading { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; background:var(--ink3); }
.loading-orb { width:48px; height:48px; border-radius:50%; border:1.5px solid var(--line2); border-top-color:var(--gold); animation:spin 1s linear infinite; }
.loading-txt { font-size:10px; letter-spacing:2px; color:var(--dim); text-transform:uppercase; }
.loading-sub { font-size:11px; color:var(--faint); }
.scan-line { position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,var(--gold),transparent); opacity:.3; animation:scan 2.2s ease-in-out infinite; }
.result-meta { padding:16px 22px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:9px; }
.meta-row { display:flex; gap:12px; align-items:flex-start; }
.meta-key { font-size:9px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--faint); min-width:52px; padding-top:2px; flex-shrink:0; }
.meta-val { font-size:13px; color:var(--cream); line-height:1.5; }
.meta-val.gold { color:var(--gold); font-weight:600; }
.source-tag { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:100px; font-size:11px; }
.source-tag.text   { background:rgba(201,168,76,.11); color:var(--gold); border:1px solid rgba(201,168,76,.23); }
.source-tag.speech { background:rgba(62,207,184,.09); color:var(--teal); border:1px solid rgba(62,207,184,.2); }
.source-tag.sign   { background:rgba(91,141,238,.09); color:var(--blue); border:1px solid rgba(91,141,238,.2); }
.action-row { padding:0 22px 18px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.action-btn { padding:10px; background:transparent; border:1px solid var(--line2); border-radius:var(--rsm); color:var(--dim); font-family:var(--sans); font-size:11px; cursor:pointer; transition:all var(--ease); display:flex; align-items:center; justify-content:center; gap:5px; }
.action-btn:hover { border-color:var(--gold); color:var(--gold); background:var(--glow); }
.action-btn:disabled { opacity:.3; cursor:not-allowed; }
.error-bar { margin:14px 22px 0; padding:12px 14px; background:rgba(224,85,85,.08); border:1px solid rgba(224,85,85,.22); border-radius:var(--rsm); font-size:12px; color:#f4a0a0; display:flex; gap:8px; align-items:flex-start; }

/* ── Dataset Viewer Page ── */
.dataset-wrap { max-width:1200px; margin:0 auto; padding:48px 48px 80px; }
.dv-header { margin-bottom:36px; }
.dv-title { font-family:var(--serif); font-size:36px; font-weight:300; }
.dv-title em { color:var(--gold); font-style:italic; }
.dv-sub { color:var(--dim); font-size:13px; margin-top:6px; }
.dv-filter { display:flex; gap:6px; flex-wrap:wrap; margin-top:18px; }
.dv-pill { padding:5px 14px; border:1px solid var(--line2); border-radius:100px; font-size:12px; font-weight:600; color:var(--dim); cursor:pointer; transition:all var(--ease); background:none; font-family:var(--sans); }
.dv-pill:hover, .dv-pill.active { border-color:var(--gold); color:var(--gold); background:var(--glow); }
.dv-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; }
.dv-card { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; transition:all var(--ease); cursor:pointer; }
.dv-card:hover { border-color:rgba(201,168,76,.35); transform:translateY(-2px); box-shadow:0 10px 32px rgba(0,0,0,.4); }
.dv-card.selected { border-color:var(--gold); background:var(--card2); }
.dv-card-head { padding:14px 16px 10px; display:flex; align-items:center; justify-content:space-between; }
.dv-letter { font-family:var(--serif); font-size:42px; font-weight:300; color:var(--gold); line-height:1; }
.dv-variant { font-size:10px; color:var(--faint); }
.dv-desc { padding:0 16px 12px; font-size:11px; color:var(--dim); line-height:1.55; }
.dv-lm-vis { padding:8px 16px 16px; }
.dv-canvas { width:100%; height:90px; background:var(--ink3); border-radius:8px; border:1px solid var(--line); display:block; }
.dv-detail { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; animation:slideUp .35s ease; }
.dv-detail-title { font-family:var(--serif); font-size:28px; font-weight:300; margin-bottom:4px; }
.dv-detail-title em { color:var(--gold); }
.dv-detail-desc { color:var(--dim); font-size:13px; margin-bottom:22px; }
.dv-lm-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:16px; }
.dv-lm-item { background:var(--ink3); border-radius:8px; padding:8px 10px; }
.dv-lm-name { font-size:9px; font-weight:600; letter-spacing:1.5px; color:var(--faint); text-transform:uppercase; }
.dv-lm-val { font-size:12px; color:var(--cream); font-family:monospace; margin-top:2px; }

/* ── Recorder Page ── */
.recorder-wrap { max-width:1100px; margin:0 auto; padding:48px 48px 80px; }
.rec-header { margin-bottom:36px; }
.rec-title { font-family:var(--serif); font-size:36px; font-weight:300; }
.rec-title em { color:var(--gold); font-style:italic; }
.rec-sub { color:var(--dim); font-size:13px; margin-top:6px; }
.rec-layout { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.rec-cam-panel, .rec-info-panel { background:var(--card); border:1px solid var(--line); border-radius:18px; overflow:hidden; }
.rec-cam-wrap { position:relative; aspect-ratio:4/3; background:var(--ink3); }
.rec-cam-wrap video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); display:block; }
.rec-cam-wrap canvas { position:absolute; inset:0; width:100%; height:100%; transform:scaleX(-1); }
.rec-cam-actions { padding:16px 20px; display:flex; gap:10px; border-top:1px solid var(--line); flex-wrap:wrap; align-items:center; }
.rec-btn { padding:9px 20px; border:1px solid var(--line2); border-radius:100px; background:transparent; color:var(--dim); font-family:var(--sans); font-size:12px; font-weight:500; cursor:pointer; transition:all var(--ease); }
.rec-btn:hover { border-color:var(--gold); color:var(--gold); }
.rec-btn.primary { background:linear-gradient(135deg,var(--gold),var(--gold2)); border-color:transparent; color:var(--ink); font-weight:700; }
.rec-btn.primary:hover { transform:scale(1.03); }
.rec-btn.danger { border-color:rgba(224,85,85,.4); color:var(--red); }
.rec-btn.danger:hover { background:rgba(224,85,85,.1); }
.rec-btn:disabled { opacity:.3; cursor:not-allowed; }
.rec-info-panel { padding:24px; }
.rec-target { margin-bottom:20px; }
.rec-target-label { font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--faint); margin-bottom:10px; }
.rec-letter-row { display:flex; flex-wrap:wrap; gap:6px; }
.rec-letter-btn { width:38px; height:38px; border:1px solid var(--line2); border-radius:8px; background:transparent; color:var(--dim); font-family:var(--sans); font-size:14px; font-weight:600; cursor:pointer; transition:all var(--ease); display:flex; align-items:center; justify-content:center; }
.rec-letter-btn:hover { border-color:var(--gold); color:var(--gold); }
.rec-letter-btn.active { background:var(--glow); border-color:var(--gold); color:var(--gold); }
.rec-letter-btn.done { background:rgba(76,175,125,.12); border-color:rgba(76,175,125,.4); color:var(--green); }
.rec-status { margin-top:18px; padding:16px; background:var(--ink3); border-radius:10px; }
.rec-status-letter { font-family:var(--serif); font-size:56px; color:var(--gold); line-height:1; }
.rec-status-label { font-size:11px; color:var(--dim); margin-top:4px; }
.rec-counter { display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; }
.rec-count-item { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 14px; }
.rec-count-val { font-size:20px; font-weight:600; color:var(--cream); }
.rec-count-key { font-size:9px; color:var(--faint); letter-spacing:1.5px; text-transform:uppercase; }
.rec-samples-list { margin-top:18px; max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; }
.rec-sample-item { background:var(--ink3); border:1px solid var(--line); border-radius:8px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; font-size:12px; }
.rec-sample-letter { font-family:var(--serif); font-size:20px; color:var(--gold); }
.rec-sample-info { color:var(--dim); font-size:11px; }
.rec-export-btn { margin-top:16px; width:100%; }

/* ── Footer ── */
footer { position:relative; z-index:1; border-top:1px solid var(--line); padding:16px 48px; display:flex; align-items:center; justify-content:space-between; }
.footer-wm { font-family:var(--serif); font-size:15px; font-weight:300; color:var(--faint); letter-spacing:1px; }
.footer-wm em { color:var(--gold); font-style:italic; }
.footer-right { font-size:10px; color:var(--faint); letter-spacing:.8px; }

@media (max-width:900px) {
  .studio-wrap, .dataset-wrap, .recorder-wrap { padding:80px 18px 40px; grid-template-columns:1fr; }
  nav { padding:0 18px; }
  .nav-tabs { display:none; }
  .output-panel { position:static; }
  .sign-top { grid-template-columns:1fr; }
  .alpha-grid { grid-template-columns:repeat(9,1fr); }
  .rec-layout { grid-template-columns:1fr; }
  footer { padding:14px 18px; flex-direction:column; gap:5px; text-align:center; }
  .dv-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
}
`;

// ── ASL Alphabet reference ─────────────────────────────────────────────────────
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const LETTER_HINTS = {
  A:"Fist, thumb on side", B:"4 fingers up, thumb tucked", C:"Curved C shape",
  D:"Index up, thumb+middle touch", E:"Clawed fingers, thumb tucked",
  F:"OK sign + 3 fingers up", G:"Index sideways, thumb parallel",
  H:"Index+middle sideways", I:"Pinky only up", J:"Pinky up + draw J",
  K:"Index+middle up, thumb between", L:"L shape (index+thumb)",
  M:"3 fingers over thumb", N:"2 fingers over thumb", O:"Round O shape",
  P:"K pointing down", Q:"G pointing down", R:"Index+middle crossed",
  S:"Fist, thumb over front", T:"Thumb between idx+mid",
  U:"Index+middle up, together", V:"Victory / peace sign",
  W:"3 fingers up spread", X:"Index hooked", Y:"Thumb+pinky out (shaka)",
  Z:"Index draws Z"
};

// ── Login ──────────────────────────────────────────────────────────────────────
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
    }, 800);
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
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()} />
          {error && <div className="login-error">⚠ {error}</div>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? <><span className="btn-spinner" /> Signing in…</> : <><span className="shimmer" />Sign In</>}
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

// ── Text Mode ──────────────────────────────────────────────────────────────────
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

// ── Speech Mode ────────────────────────────────────────────────────────────────
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
      <div className={`mic-ring ${live ? "recording" : ""}`} onClick={toggle}>
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

// ── Sign Language Mode ─────────────────────────────────────────────────────────
function SignMode({ onPromptChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const camRef = useRef(null);
  const holdRef = useRef({ letter: null, ms: 0, frames: 0, lastTime: Date.now() });

  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [signedText, setSignedText] = useState("");
  const [liveLetter, setLiveLetter] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [predictMode, setPredictMode] = useState("unknown");
  const [handVisible, setHandVisible] = useState(false);
  const [recentCell, setRecentCell] = useState(null);
  const [allScores, setAllScores] = useState({});
  const [showDebug, setShowDebug] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(isModelLoaded());
  const [modelError, setModelError] = useState(getModelError());

  useEffect(() => { onPromptChange(signedText.trim()); }, [signedText, onPromptChange]);

  const appendChar = useCallback((ch) => {
    setSignedText(prev => prev + ch);
    setRecentCell(ch);
    setTimeout(() => setRecentCell(null), 1400);
  }, []);

  const addSpace = () => setSignedText(p => p + " ");
  const delChar  = () => setSignedText(p => p.slice(0, -1));
  const clearAll = () => { setSignedText(""); onPromptChange(""); resetHistory(); };

  const onResults = useCallback((results, drawConnectors, drawLandmarks, HAND_CONNECTIONS) => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasHand = results.multiHandLandmarks?.length > 0;
    setHandVisible(hasHand);

    if (hasHand) {
      const lm = results.multiHandLandmarks[0];
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "rgba(201,168,76,0.55)", lineWidth: 1.5 });
      drawLandmarks(ctx, lm, { color: "rgba(232,201,122,0.9)", fillColor: "rgba(201,168,76,0.4)", lineWidth: 1, radius: 3 });

      const result = classifyASL(lm, true);
      const detected = result?.letter ?? null;
      const conf = result?.confidence ?? 0;
      setLiveLetter(detected);
      setConfidence(conf);
      setPredictMode(result?.mode ?? "unknown");
      if (result?.allScores) setAllScores(result.allScores);

      const now = Date.now(), dt = now - holdRef.current.lastTime;
      holdRef.current.lastTime = now;

      if (detected && conf >= LETTER_CONF_THRESHOLD && detected === holdRef.current.letter) {
        holdRef.current.frames += 1;
        holdRef.current.ms += dt;
        if (holdRef.current.ms >= LETTER_HOLD_MS && holdRef.current.frames >= 4) {
          appendChar(detected);
          holdRef.current.ms = 0;
          holdRef.current.frames = 0;
          holdRef.current.letter = null;
        }
      } else if (detected && conf >= LETTER_CONF_THRESHOLD) {
        holdRef.current.letter = detected;
        holdRef.current.ms = 0;
        holdRef.current.frames = 1;
      } else {
        holdRef.current.letter = null;
        holdRef.current.ms = 0;
        holdRef.current.frames = 0;
      }
    } else {
      setLiveLetter(null); setConfidence(0); setPredictMode("unknown"); setAllScores({});
      holdRef.current.letter = null; holdRef.current.ms = 0;
    }
  }, [appendChar]);

  useEffect(() => {
    const interval = setInterval(() => {
      setModelLoaded(isModelLoaded());
      setModelError(getModelError());
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const startCamera = useCallback(async () => {
    setCamLoading(true);
    try {
      await loadTrainedModel();
      const [hmod, cmod, dmod] = await Promise.all([
        import("@mediapipe/hands"),
        import("@mediapipe/camera_utils"),
        import("@mediapipe/drawing_utils"),
      ]);
      const { Hands, HAND_CONNECTIONS } = hmod;
      const { Camera } = cmod;
      const { drawConnectors, drawLandmarks } = dmod;

      const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.72, minTrackingConfidence: 0.68 });
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
      startDemo();
    } finally {
      setCamLoading(false);
    }
  }, [onResults]);

  const stopCamera = useCallback(() => {
    camRef.current?.stop();
    if (handsRef.current) { try { handsRef.current.close(); } catch (_) {} handsRef.current = null; }
    const vid = videoRef.current;
    if (vid?.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); vid.srcObject = null; }
    setCamActive(false); setLiveLetter(null); setConfidence(0); setHandVisible(false); setAllScores({});
    resetHistory();
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const demoRef = useRef(null);
  const startDemo = () => {
    setCamActive(true);
    const word = "VISUAL"; let i = 0; let acc = 0;
    demoRef.current = setInterval(() => {
      setHandVisible(true);
      const l = word[i % word.length];
      setLiveLetter(l); setConfidence(0.85 + Math.random() * 0.1);
      acc += 300;
      if (acc >= 900) { appendChar(l); acc = 0; i++; }
    }, 300);
  };
  useEffect(() => () => { if (demoRef.current) clearInterval(demoRef.current); }, []);

  const confPct = Math.round(confidence * 100);
  const topScores = Object.entries(allScores).sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <div className="sign-wrapper">
      <div className="sign-top">
        <div className="cam-frame">
          <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="cam-canvas" />
          {!camActive && (
            <div className="cam-overlay">
              {camLoading
                ? <><div style={{ width:26, height:26, border:"2px solid rgba(255,255,255,.1)", borderTopColor:"var(--gold)", borderRadius:"50%", animation:"spin .8s linear infinite" }} /><span>Loading AI model…</span></>
                : <><span style={{ fontSize:13 }}>Real-time ASL A–Z detection</span><button className="cam-start-btn" onClick={startCamera}>Start Camera</button></>
              }
            </div>
          )}
          {camActive && <button className="cam-stop-btn" onClick={stopCamera}>■ Stop</button>}
        </div>

        <div className="live-panel">
          <div className="lp-label">Detected letter</div>
          <div className="hand-row">
            <div className={`hand-indicator ${handVisible ? "on" : ""}`} />
            <span className="hand-status">{handVisible ? "Hand detected" : "No hand"}</span>
          </div>
          <div className="live-letter">{liveLetter ?? "—"}</div>
          <div className="conf-bar-wrap">
            <div className="conf-label"><span>Confidence</span><span>{confPct}%</span></div>
            <div className="conf-bar"><div className="conf-fill" style={{ width: confPct + "%" }} /></div>
          </div>
          {liveLetter && LETTER_HINTS[liveLetter] && (
            <div style={{ fontSize:11, color:"var(--faint)", marginTop:6, lineHeight:1.5 }}>{LETTER_HINTS[liveLetter]}</div>
          )}
          <div style={{ fontSize:11, color:"var(--dim)", marginTop:8, lineHeight:1.5 }}>
            Letters only commit when the model is confident enough ({Math.round(LETTER_CONF_THRESHOLD * 100)}%+).
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, fontSize:11, color:"var(--dim)", marginTop:10 }}>
            <div>{modelError ? `Model error: ${modelError}` : modelLoaded ? "Using trained KNN model" : "Using geometric fallback"}</div>
            <div>{predictMode === "knn" ? "Predict mode: KNN" : predictMode === "geometric" ? "Predict mode: geometric" : "Predict mode: unknown"}</div>
          </div>
          <button className="ts-btn" style={{ marginTop:10, fontSize:10 }} onClick={() => setShowDebug(d => !d)}>
            {showDebug ? "Hide" : "Show"} scores
          </button>
          {showDebug && topScores.length > 0 && (
            <div className="debug-grid">
              {topScores.map(([l, s]) => (
                <div key={l} className={`debug-cell ${l === liveLetter ? "hi" : ""}`}>
                  {l}<br /><span style={{ fontSize:8 }}>{(s * 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="typed-section">
        <div className="ts-header">
          <span className="ts-label">Signed phrase</span>
          <div className="ts-actions">
            <button className="ts-btn" onClick={addSpace}>Space</button>
            <button className="ts-btn danger" onClick={delChar}>⌫</button>
            <button className="ts-btn danger" onClick={clearAll}>Clear</button>
          </div>
        </div>
        <div className="typed-text">
          {signedText}
          <span className="typed-cursor" />
        </div>
        <div className="typed-hint">Hold each sign steady for ~{LETTER_HOLD_MS / 1000}s to register.</div>
      </div>

      <div className="alpha-section">
        <div className="alpha-title">ASL alphabet reference</div>
        <div className="alpha-grid">
          {LETTERS.map(ch => (
            <div key={ch} className={`alpha-cell ${liveLetter === ch ? "active" : ""} ${recentCell === ch ? "recent" : ""}`}>
              {ch}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Output Panel ───────────────────────────────────────────────────────────────
function OutputPanel({ result, loading, error }) {
  const download = () => {
    if (!result?.image_url) return;
    const a = document.createElement("a");
    a.href = result.image_url; a.download = "visualai.png"; a.click();
  };
  const copyLink = () => {
    if (result?.image_url) navigator.clipboard?.writeText(result.image_url).then(() => alert("Copied!"));
  };

  const srcLabels = { text: "✦ Text", speech: "🎙 Speech", sign: "🤟 ASL Sign" };

  return (
    <div className="panel output-panel">
      <div className="panel-head">
        <span className="panel-label">Canvas Output</span>
        {result && <span className="panel-badge">HD · {(result.generation_time_ms / 1000).toFixed(1)}s</span>}
      </div>
      <div>
        <div style={{ padding:"22px 22px 0" }}>
          <div className="img-stage">
            {loading && (
              <div className="stage-loading">
                <div className="loading-orb" />
                <div className="scan-line" />
                <div className="loading-txt">Rendering</div>
                <div className="loading-sub">Generating your image…</div>
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
        {error && <div className="error-bar">⚠ {error}</div>}
        {result && (
          <>
            <div className="result-meta">
              <div className="meta-row">
                <span className="meta-key">Source</span>
                <span className={`meta-val source-tag ${result.source}`}>{srcLabels[result.source]}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Time</span>
                <span className="meta-val gold">{result.cached ? "Instant (cached)" : `${(result.generation_time_ms / 1000).toFixed(1)}s`}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Prompt</span>
                <span className="meta-val" style={{ fontSize:12, fontStyle:"italic" }}>{result.prompt_used}</span>
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

// ── Dataset Viewer Page ────────────────────────────────────────────────────────
function DatasetViewer() {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [dataset, setDataset] = useState(null);

  useEffect(() => {
    fetch("/dataset/asl_landmark_dataset.json")
      .then(r => r.json())
      .then(setDataset)
      .catch(() => setDataset(null));
  }, []);

  const letters = ["ALL", ...LETTERS];
  const samples = dataset?.samples?.filter(s => filter === "ALL" || s.label === filter) ?? [];

  const drawLandmarks = (canvas, landmarks) => {
    if (!canvas || !landmarks) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Normalize to canvas
    const xs = landmarks.map(p => p.x), ys = landmarks.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const pad = 12;

    const toX = x => pad + ((x - minX) / rangeX) * (W - pad * 2);
    const toY = y => pad + ((y - minY) / rangeY) * (H - pad * 2);

    // Connections
    const CONNS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];
    ctx.strokeStyle = "rgba(201,168,76,0.4)";
    ctx.lineWidth = 1;
    for (const [a, b] of CONNS) {
      ctx.beginPath();
      ctx.moveTo(toX(landmarks[a].x), toY(landmarks[a].y));
      ctx.lineTo(toX(landmarks[b].x), toY(landmarks[b].y));
      ctx.stroke();
    }

    // Points
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232,201,122,0.85)";
      ctx.fill();
    }
  };

  return (
    <div className="dataset-wrap">
      <div className="dv-header">
        <h1 className="dv-title">ASL <em>Dataset</em></h1>
        <p className="dv-sub">Hand landmark dataset for American Sign Language A–Z. {dataset ? `${dataset.samples?.length ?? 0} samples loaded.` : "Loading dataset…"}</p>
        <div className="dv-filter">
          {letters.map(l => (
            <button key={l} className={`dv-pill ${filter === l ? "active" : ""}`} onClick={() => setFilter(l)}>{l}</button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="dv-detail" style={{ marginBottom:24 }}>
          <div className="dv-detail-title">Letter <em>{selected.label}</em> — Variant {selected.variant}</div>
          <div className="dv-detail-desc">{selected.description}</div>
          <canvas ref={c => c && drawLandmarks(c, selected.landmarks)}
            width={280} height={180}
            style={{ background:"var(--ink3)", borderRadius:10, border:"1px solid var(--line)", display:"block" }} />
          <div className="dv-lm-grid">
            {selected.landmarks.slice(0, 9).map((lm, i) => (
              <div key={i} className="dv-lm-item">
                <div className="dv-lm-name">{["Wrist","Th-CMC","Th-MCP","Th-IP","Th-TIP","Idx-MCP","Idx-PIP","Idx-DIP","Idx-TIP"][i]}</div>
                <div className="dv-lm-val">({lm.x.toFixed(2)}, {lm.y.toFixed(2)}, {lm.z.toFixed(2)})</div>
              </div>
            ))}
          </div>
          <button className="ts-btn" style={{ marginTop:14 }} onClick={() => setSelected(null)}>Close ×</button>
        </div>
      )}

      {!dataset ? (
        <div style={{ color:"var(--dim)", padding:"40px 0", textAlign:"center" }}>
          <div style={{ width:32, height:32, border:"2px solid var(--line2)", borderTopColor:"var(--gold)", borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 14px" }} />
          Loading dataset… Make sure the backend is running or the dataset file is accessible.
        </div>
      ) : (
        <div className="dv-grid">
          {samples.map((sample, idx) => (
            <div key={idx} className={`dv-card ${selected === sample ? "selected" : ""}`} onClick={() => setSelected(selected === sample ? null : sample)}>
              <div className="dv-card-head">
                <div className="dv-letter">{sample.label}</div>
                <div className="dv-variant">Variant {sample.variant}</div>
              </div>
              <div className="dv-desc">{sample.description}</div>
              <div className="dv-lm-vis">
                <canvas className="dv-canvas"
                  ref={c => c && requestAnimationFrame(() => drawLandmarks(c, sample.landmarks))}
                  width={160} height={90} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Landmark Recorder Page ─────────────────────────────────────────────────────
function Recorder() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const camRef = useRef(null);

  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [targetLetter, setTargetLetter] = useState("A");
  const [samples, setSamples] = useState([]);
  const [lastCapture, setLastCapture] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const lastLmRef = useRef(null);

  const onResults = useCallback((results, drawConnectors, drawLandmarks, HAND_CONNECTIONS) => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks?.length > 0) {
      const lm = results.multiHandLandmarks[0];
      lastLmRef.current = lm;
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "rgba(201,168,76,0.55)", lineWidth: 1.5 });
      drawLandmarks(ctx, lm, { color: "rgba(232,201,122,0.9)", fillColor: "rgba(201,168,76,0.4)", lineWidth: 1, radius: 3 });
    } else {
      lastLmRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCamLoading(true);
    try {
      const [hmod, cmod, dmod] = await Promise.all([
        import("@mediapipe/hands"), import("@mediapipe/camera_utils"), import("@mediapipe/drawing_utils"),
      ]);
      const { Hands, HAND_CONNECTIONS } = hmod, { Camera } = cmod, { drawConnectors, drawLandmarks } = dmod;
      const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.75, minTrackingConfidence: 0.70 });
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
    } catch (err) { console.error(err); } finally { setCamLoading(false); }
  }, [onResults]);

  const stopCamera = useCallback(() => {
    camRef.current?.stop();
    if (handsRef.current) { try { handsRef.current.close(); } catch (_) {} handsRef.current = null; }
    const vid = videoRef.current;
    if (vid?.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); vid.srcObject = null; }
    setCamActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureSample = () => {
    if (!lastLmRef.current) return;
    const lm = lastLmRef.current;
    const sample = {
      label: targetLetter,
      variant: samples.filter(s => s.label === targetLetter).length + 1,
      description: `Recorded sample for ${targetLetter}`,
      timestamp: new Date().toISOString(),
      landmarks: lm.map(p => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) })),
    };
    setSamples(prev => [...prev, sample]);
    setLastCapture(sample);
    setCapturing(true);
    setTimeout(() => setCapturing(false), 500);
  };

  const exportDataset = () => {
    const data = JSON.stringify({ meta: { name:"Recorded ASL Dataset", total_samples:samples.length, created:new Date().toISOString() }, samples }, null, 2);
    const a = document.createElement("a");
    a.href = "data:application/json;charset=utf-8," + encodeURIComponent(data);
    a.download = "asl_recorded_dataset.json"; a.click();
  };

  const clearSamples = () => setSamples([]);
  const doneCounts = {};
  samples.forEach(s => { doneCounts[s.label] = (doneCounts[s.label] || 0) + 1; });

  return (
    <div className="recorder-wrap">
      <div className="rec-header">
        <h1 className="rec-title">ASL <em>Recorder</em></h1>
        <p className="rec-sub">Record your own hand landmark samples to expand the dataset. Aim for 10+ samples per letter.</p>
      </div>

      <div className="rec-layout">
        <div className="rec-cam-panel">
          <div className="rec-cam-wrap">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} />
            {!camActive && (
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(8,8,16,.85)", gap:12 }}>
                {camLoading
                  ? <div style={{ width:28, height:28, border:"2px solid rgba(255,255,255,.1)", borderTopColor:"var(--gold)", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
                  : <button className="cam-start-btn" onClick={startCamera}>Start Camera</button>}
              </div>
            )}
            {capturing && (
              <div style={{ position:"absolute", inset:0, background:"rgba(201,168,76,0.08)", border:"2px solid var(--gold)", borderRadius:0, pointerEvents:"none", animation:"fadeIn .1s" }} />
            )}
          </div>
          <div className="rec-cam-actions">
            {camActive
              ? <button className="rec-btn danger" onClick={stopCamera}>■ Stop Camera</button>
              : <button className="rec-btn primary" onClick={startCamera} disabled={camLoading}>Start Camera</button>}
            <button className="rec-btn primary" onClick={captureSample} disabled={!camActive}>
              📸 Capture ({doneCounts[targetLetter] || 0})
            </button>
            {samples.length > 0 && <button className="rec-btn" onClick={clearSamples}>Clear All</button>}
          </div>
        </div>

        <div className="rec-info-panel">
          <div className="rec-target">
            <div className="rec-target-label">Target Letter</div>
            <div className="rec-letter-row">
              {LETTERS.map(l => (
                <button key={l}
                  className={`rec-letter-btn ${targetLetter === l ? "active" : ""} ${doneCounts[l] >= 5 ? "done" : ""}`}
                  onClick={() => setTargetLetter(l)}>
                  {l}
                  {doneCounts[l] ? <span style={{ fontSize:7, position:"absolute", top:2, right:3, color:"inherit" }}>{doneCounts[l]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="rec-status">
            <div className="rec-status-letter">{targetLetter}</div>
            <div className="rec-status-label">{LETTER_HINTS[targetLetter]}</div>
            <div className="rec-counter">
              <div className="rec-count-item">
                <div className="rec-count-val">{samples.length}</div>
                <div className="rec-count-key">Total</div>
              </div>
              <div className="rec-count-item">
                <div className="rec-count-val">{doneCounts[targetLetter] || 0}</div>
                <div className="rec-count-key">This Letter</div>
              </div>
              <div className="rec-count-item">
                <div className="rec-count-val">{Object.keys(doneCounts).length}</div>
                <div className="rec-count-key">Letters Done</div>
              </div>
            </div>
          </div>

          {samples.length > 0 && (
            <div className="rec-samples-list">
              {[...samples].reverse().map((s, i) => (
                <div key={i} className="rec-sample-item">
                  <span className="rec-sample-letter">{s.label}</span>
                  <span className="rec-sample-info">Variant {s.variant} · {new Date(s.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}

          {samples.length > 0 && (
            <button className="rec-btn primary rec-export-btn" onClick={exportDataset}>
              ↓ Export Dataset JSON ({samples.length} samples)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Studio Page ────────────────────────────────────────────────────────────────
function Studio() {
  const [mode, setMode] = useState("text");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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

  const MODES = [
    { id: "text", icon: "✦", label: "Text" },
    { id: "speech", icon: "🎙", label: "Speech" },
    { id: "sign", icon: "🤟", label: "ASL A–Z" },
  ];

  return (
    <div className="studio-wrap">
      <div className="studio-header">
        <h1 className="studio-title">Create from <em>any input</em></h1>
        <p className="studio-sub">Generate stunning HD images using text, voice, or real-time ASL sign language.</p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-label">Input Studio</span>
          <span className="panel-badge">{MODES.find(m => m.id === mode)?.label}</span>
        </div>
        <div className="panel-body">
          <div className="mode-tabs">
            {MODES.map(m => (
              <button key={m.id} className={`mode-tab ${mode === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
                <span className="mode-tab-icon">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {mode === "text"   && <TextMode value={prompt} onChange={setPrompt} />}
          {mode === "speech" && <SpeechMode value={prompt} onChange={setPrompt} />}
          {mode === "sign"   && <SignMode onPromptChange={handleSignPrompt} />}

          {prompt.trim() && (
            <div className="prompt-preview">
              "{prompt.slice(0, 90)}{prompt.length > 90 ? "…" : ""}"
            </div>
          )}

          <button className="gen-btn" onClick={handleGenerate} disabled={!prompt.trim() || loading}>
            {loading ? <><span className="gen-spinner" />Generating…</> : <><span className="btn-shine" />✦ Generate Image</>}
          </button>
        </div>
      </div>

      <OutputPanel result={result} loading={loading} error={error} />
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("studio"); // "studio" | "dataset" | "recorder"

  const logout = () => { setUser(null); setPage("studio"); };

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {!user && <LoginScreen onLogin={setUser} />}

      <div className="amb amb-1" />
      <div className="amb amb-2" />
      <div className="amb amb-3" />

      <nav style={{ display: user ? "flex" : "none" }}>
        <div className="nav-wordmark">Visual<em>AI</em></div>
        <div className="nav-tabs">
          {[
            { id:"studio",   label:"🎨 Studio" },
            { id:"dataset",  label:"📊 Dataset" },
            { id:"recorder", label:"⬤ Recorder" },
          ].map(t => (
            <button key={t.id} className={`nav-tab ${page === t.id ? "active" : ""}`} onClick={() => setPage(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {user && (
          <div className="nav-right">
            <div className="nav-avatar">{user.initials}</div>
            <span className="nav-name">{user.name}</span>
            <button className="nav-logout" onClick={logout}>Sign out</button>
          </div>
        )}
      </nav>

      {user && (
        <div className="page">
          {page === "studio"   && <Studio />}
          {page === "dataset"  && <DatasetViewer />}
          {page === "recorder" && <Recorder />}

          <footer>
            <div className="footer-wm">Visual<em>AI</em></div>
            <div className="footer-right">STUDIO · DATASET · RECORDER · {new Date().getFullYear()}</div>
          </footer>
        </div>
      )}
    </>
  );
}
