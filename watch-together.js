/*
 * Watch Together — a single-file prototype
 * -----------------------------------------
 * Two ways to watch: you and one other person each open your OWN local copy
 * of a video file, or either of you pastes a YouTube link and it loads for
 * both of you at once. Only the controls (play / pause / seek) and a
 * voice+video call travel over the internet — a local video file itself
 * never leaves either device. Tiny bandwidth, "sitting next to each other"
 * feel.
 *
 * Run it:
 *   npm init -y           (once, if you don't have a package.json)
 *   npm install ws
 *   node watch-together.js
 *
 * Then open http://localhost:3000 in two browsers/tabs. To watch with someone
 * far away, deploy this file to any host that allows long-lived WebSocket
 * connections (Railway, Render, Fly.io) and share the URL.
 *
 * For local files, both people need the same file on their own machine.
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// The client. Served as one HTML page. Kept as a plain template literal, so the
// browser-side script below deliberately avoids backticks / ${} of its own.
// ---------------------------------------------------------------------------
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Watch Together</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" rel="stylesheet">
<style>
  :root {
    --night: #15121d;
    --night-2: #1c1828;
    --panel: #221d31;
    --panel-2: #2a2439;
    --line: rgba(255,255,255,0.09);
    --ink: #f2ece6;
    --muted: #9c93ab;
    --lamp: #f3b56a;        /* warm lamp glow */
    --lamp-soft: #f6c88b;
    --rose: #e87f95;        /* the heart moments */
    --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  /* Cool "moonlight" palette — same tokens, different mood. Everything else
     in the page is already built on these variables, so swapping them here
     re-themes the whole app for free. */
  :root[data-theme="moonlight"] {
    --night: #0f1620;
    --night-2: #131c28;
    --panel: #1a2532;
    --panel-2: #20303f;
    --ink: #eaf1f7;
    --muted: #8ea2b3;
    --lamp: #6fb3e0;
    --lamp-soft: #9cd0ef;
    --rose: #8f9ff0;
  }
  .themeToggle {
    position: fixed; bottom: 14px; left: 14px; z-index: 50;
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--panel); border: 1px solid var(--line); color: var(--ink);
    font-size: 15px; display: flex; align-items: center; justify-content: center;
    transition: border-color .15s, background .3s ease;
  }
  .themeToggle:hover { border-color: rgba(243,181,106,0.5); }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: var(--sans);
    color: var(--ink);
    background:
      radial-gradient(1200px 700px at 78% -8%, rgba(243,181,106,0.16), transparent 60%),
      radial-gradient(900px 600px at 8% 108%, rgba(232,127,149,0.12), transparent 60%),
      var(--night);
    -webkit-font-smoothing: antialiased;
  }
  button { font-family: inherit; cursor: pointer; }
  .hidden { display: none !important; }

  /* ---------- Setup screen ---------- */
  #setup {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 430px;
    background: linear-gradient(180deg, var(--panel), var(--night-2));
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 40px 34px 34px;
    box-shadow: 0 30px 80px -30px rgba(0,0,0,0.7);
  }
  .lamp-mark {
    display: flex; align-items: center; gap: 10px;
    color: var(--lamp); margin-bottom: 22px;
  }
  .lamp-mark .dot {
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--lamp);
    box-shadow: 0 0 16px 3px rgba(243,181,106,0.7);
  }
  .lamp-mark span { font-size: 13px; letter-spacing: 0.14em; color: var(--muted); }
  h1 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 40px;
    line-height: 1.05;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
  }
  h1 .em { font-style: italic; color: var(--lamp-soft); }
  .sub { color: var(--muted); font-size: 15px; line-height: 1.55; margin: 0 0 26px; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 0 0 7px; }
  .field { margin-bottom: 18px; }
  input[type="text"] {
    width: 100%;
    background: var(--night);
    border: 1px solid var(--line);
    color: var(--ink);
    font-size: 16px;
    padding: 13px 15px;
    border-radius: 13px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input[type="text"]:focus {
    border-color: rgba(243,181,106,0.6);
    box-shadow: 0 0 0 3px rgba(243,181,106,0.14);
  }
  .join {
    width: 100%;
    margin-top: 8px;
    border: none;
    border-radius: 13px;
    padding: 15px;
    font-size: 16px;
    font-weight: 600;
    color: #2a1a06;
    background: linear-gradient(180deg, var(--lamp-soft), var(--lamp));
    box-shadow: 0 12px 30px -10px rgba(243,181,106,0.55);
    transition: transform .08s, filter .15s;
  }
  .join:hover { filter: brightness(1.04); }
  .join:active { transform: translateY(1px); }
  .fineprint { margin-top: 18px; font-size: 12.5px; color: var(--muted); line-height: 1.5; }

  /* ---------- App screen ---------- */
  #app { min-height: 100dvh; display: flex; flex-direction: column; }
  .topbar {
    display: flex; align-items: center; gap: 16px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .brand { display:flex; align-items:center; gap:9px; color: var(--lamp); font-weight:600; font-size:15px; }
  .brand .dot { width:8px; height:8px; border-radius:50%; background:var(--lamp); box-shadow:0 0 12px 2px rgba(243,181,106,0.7); }
  .status { display:flex; align-items:center; gap:8px; color: var(--muted); font-size:13.5px; }
  .status .pill { width:8px; height:8px; border-radius:50%; background:var(--muted); transition: background .3s; }
  .status.on .pill { background:#67d98b; box-shadow:0 0 10px 1px rgba(103,217,139,0.6); }
  .together {
    margin-left: auto;
    font-family: var(--serif);
    font-size: 15px;
    color: var(--lamp-soft);
    display: flex; align-items: baseline; gap: 8px;
  }
  .together .label { font-family: var(--sans); font-size: 12px; color: var(--muted); }
  .invite {
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--ink);
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
  }
  .invite:hover { border-color: rgba(243,181,106,0.5); }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 16px; height: 16px; padding: 0 4px; margin-left: 6px;
    border-radius: 100px; background: var(--rose); color: #2a1a06;
    font-size: 10px; font-weight: 700; vertical-align: middle;
  }

  /* ---------- Text chat (fallback if voice/video won't connect) ---------- */
  /* A real sidebar that shares the room with the movie instead of covering it. */
  .middle { display: flex; flex: 1; min-height: 0; }
  .chatPanel {
    width: 320px; max-width: 40vw; flex-shrink: 0;
    background: linear-gradient(180deg, var(--panel), var(--night-2));
    border-left: 1px solid var(--line);
    display: flex; flex-direction: column;
    overflow: hidden;
    transition: width .3s ease, opacity .3s ease, border-color .3s ease;
  }
  .chatPanel.closed { width: 0; opacity: 0; border-left-color: transparent; }
  .chatHead {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--line);
    font-family: var(--serif); font-size: 16px;
  }
  .chatHead button { background: none; border: none; color: var(--muted); font-size: 18px; line-height: 1; }
  .chatHead button:hover { color: var(--ink); }
  .chatLog {
    flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
    scrollbar-width: thin; scrollbar-color: rgba(243,181,106,0.4) transparent;
  }
  .chatLog::-webkit-scrollbar { width: 8px; }
  .chatLog::-webkit-scrollbar-track { background: transparent; }
  .chatLog::-webkit-scrollbar-thumb { background: rgba(243,181,106,0.35); border-radius: 100px; }
  .chatLog::-webkit-scrollbar-thumb:hover { background: rgba(243,181,106,0.55); }
  .msg { display: flex; gap: 8px; max-width: 88%; font-size: 14px; line-height: 1.4; }
  .msg .content { display: flex; flex-direction: column; min-width: 0; }
  .msg .who { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
  .msg .bubble { padding: 9px 12px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--line); overflow-wrap: anywhere; }
  .msg .avatar {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #241a30;
  }
  .msg.mine { align-self: flex-end; flex-direction: row-reverse; }
  .msg.mine .content { align-items: flex-end; }
  .msg.mine .bubble { background: rgba(243,181,106,0.14); border-color: rgba(243,181,106,0.35); }
  .chatForm { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--line); }
  .chatForm input {
    flex: 1; background: var(--night); border: 1px solid var(--line); color: var(--ink);
    border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none;
  }
  .chatForm input:focus { border-color: rgba(243,181,106,0.6); }
  .chatForm button {
    border: none; border-radius: 10px; padding: 0 16px; font-weight: 600;
    color: #2a1a06; background: linear-gradient(180deg, var(--lamp-soft), var(--lamp));
  }
  @media (max-width: 620px) {
    /* No room to squeeze the video on a phone — chat covers it instead, same as before. */
    .chatPanel {
      position: fixed; inset: 0; z-index: 30;
      width: auto; max-width: 100vw;
      box-shadow: -30px 0 60px -30px rgba(0,0,0,0.7);
      transition: transform .3s ease, opacity .3s ease;
    }
    .chatPanel.closed { width: auto; transform: translateX(100%); pointer-events: none; }
  }

  .stage {
    flex: 1;
    min-width: 0;
    position: relative;
    display: grid;
    place-items: center;
    padding: 18px;
    min-height: 0;
  }
  .screen {
    position: relative;
    width: 100%;
    max-width: 1100px;
    aspect-ratio: 16 / 9;
    background: #000;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 40px 90px -40px rgba(0,0,0,0.8);
  }
  #video { width: 100%; height: 100%; background:#000; display:block; object-fit: contain; }

  /* 'F' key fullscreen — the whole stage (video + webcams) fills the display,
     the video itself stretches edge-to-edge, and chat/reactions become a
     floating overlay so nothing needs to be reachable "outside" the screen. */
  .stage:fullscreen, .stage:-webkit-full-screen {
    width: 100vw; height: 100vh; padding: 0; background: #000;
  }
  .stage:fullscreen .screen, .stage:-webkit-full-screen .screen {
    max-width: none; width: 100%; height: 100%; aspect-ratio: unset; border-radius: 0; border: none;
  }
  /* A soft theater vignette, only when the video fills the whole display —
     the windowed 16:9 box already reads as "framed" without one. */
  .screen::after {
    content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none;
    opacity: 0; transition: opacity .5s ease;
    background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%);
  }
  .stage:fullscreen .screen::after, .stage:-webkit-full-screen .screen::after { opacity: 1; }
  .floats-fs { position: absolute; inset: 0; pointer-events: none; z-index: 20; }
  .fsBar { display: none; }
  .stage:fullscreen .fsBar, .stage:-webkit-full-screen .fsBar {
    display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
    gap: 10px; max-width: 92vw;
    position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
    z-index: 26;
    background: rgba(21,18,29,0.55);
    border: 1px solid var(--line);
    padding: 10px 14px; border-radius: 100px;
    backdrop-filter: blur(6px);
    transition: opacity .6s ease;
  }
  .stage:fullscreen .chatPanel, .stage:-webkit-full-screen .chatPanel {
    position: absolute; top: 16px; right: 16px; bottom: 16px;
    width: 320px; max-width: 78vw;
    z-index: 25;
    background: rgba(21,18,29,0.62);
    backdrop-filter: blur(12px);
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px -20px rgba(0,0,0,0.7);
    transition: transform .3s ease, opacity .3s ease;
  }
  .stage:fullscreen .chatPanel.closed, .stage:-webkit-full-screen .chatPanel.closed {
    width: 320px; transform: translateX(120%); opacity: 0; pointer-events: none;
  }

  .empty {
    position: absolute; inset: 0;
    display: grid; place-items: center; text-align: center;
    padding: 24px;
  }
  .empty .inner { max-width: 380px; }
  .empty h2 { font-family: var(--serif); font-weight: 500; font-size: 24px; margin: 0 0 8px; }
  .empty p { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 0 0 18px; }
  .sourceChoices { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .load {
    display: inline-block;
    border: 1px solid rgba(243,181,106,0.5);
    color: var(--lamp-soft);
    background: rgba(243,181,106,0.08);
    padding: 12px 20px;
    border-radius: 12px;
    font-size: 15px; font-weight: 500;
    font-family: inherit;
  }
  .load:hover { background: rgba(243,181,106,0.16); }
  #ytPlayer, #ytPlayer iframe { width: 100%; height: 100%; display: block; border: none; }

  /* ---------- YouTube link modal ---------- */
  .ytOverlay {
    position: fixed; inset: 0; z-index: 40;
    display: grid; place-items: center;
    background: rgba(21,18,29,0.72); backdrop-filter: blur(4px);
    padding: 20px;
  }
  .ytCard {
    width: 100%; max-width: 400px;
    background: linear-gradient(180deg, var(--panel), var(--night-2));
    border: 1px solid var(--line); border-radius: 20px;
    padding: 28px; text-align: center;
    box-shadow: 0 30px 80px -30px rgba(0,0,0,0.7);
  }
  .ytCard h2 { font-family: var(--serif); font-weight: 500; font-size: 22px; margin: 0 0 6px; }
  .ytSub { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
  .ytCard input {
    width: 100%; background: var(--night); border: 1px solid var(--line); color: var(--ink);
    font-size: 15px; padding: 12px 14px; border-radius: 12px; outline: none;
  }
  .ytCard input:focus { border-color: rgba(243,181,106,0.6); }
  .ytHint { color: var(--rose); font-size: 12.5px; margin: 10px 0 0; text-align: left; }
  .ytActions { display: flex; gap: 10px; margin-top: 18px; }
  .ytActions button {
    flex: 1; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600;
  }
  #ytCancelBtn { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); }
  #ytLoadBtn { color: #2a1a06; background: linear-gradient(180deg, var(--lamp-soft), var(--lamp)); }

  /* tap-to-sync overlay (mobile autoplay guard) */
  .tap {
    position: absolute; inset: 0; z-index: 5;
    display: grid; place-items: center;
    background: rgba(21,18,29,0.72); backdrop-filter: blur(3px);
  }
  .tap button {
    border: none; border-radius: 100px; padding: 16px 30px;
    font-size: 16px; font-weight: 600; color:#2a1a06;
    background: linear-gradient(180deg, var(--lamp-soft), var(--lamp));
  }

  /* partner call thumbnails */
  .calls {
    position: absolute; right: 26px; bottom: 26px; z-index: 6;
    display: flex; flex-direction: column; gap: 12px; align-items: flex-end;
    cursor: grab; transition: opacity .6s ease;
    touch-action: none;
  }
  .calls.dragging { cursor: grabbing; transition: none; }
  .cam {
    width: 176px; aspect-ratio: 4/3;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 20px 40px -18px rgba(0,0,0,0.8);
  }
  .cam video { width:100%; height:100%; object-fit: cover; display:block; transform: scaleX(-1); }
  .cam .tag {
    position:absolute; left:8px; bottom:7px; right: 8px;
    font-size:11px; color:var(--ink);
    background: rgba(21,18,29,0.6); padding:2px 8px; border-radius:6px;
    backdrop-filter: blur(4px);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cam .off {
    position:absolute; inset:0; display:grid; place-items:center;
    color: var(--muted); font-family:var(--serif); font-size: 30px;
    background: var(--panel-2);
  }
  .cam.local { width: 128px; }

  /* controls */
  .dock {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 14px; flex-wrap: wrap;
    border-top: 1px solid var(--line);
  }
  .ctrl {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--ink);
    padding: 11px 16px;
    border-radius: 12px;
    font-size: 14px;
  }
  .ctrl:hover { border-color: rgba(255,255,255,0.2); }
  .ctrl.off { color: var(--muted); background: transparent; }
  .ctrl.primary { color: var(--lamp-soft); border-color: rgba(243,181,106,0.4); }
  .reacts { display:flex; gap:6px; margin-left: 6px; }
  .reacts button {
    background: transparent; border: 1px solid var(--line);
    border-radius: 11px; font-size: 18px; line-height: 1;
    padding: 9px 11px;
  }
  .reacts button:hover { border-color: var(--rose); transform: translateY(-1px); }

  /* floating reactions */
  #floats { position: fixed; inset: 0; pointer-events: none; z-index: 20; }
  .float {
    position: absolute; bottom: 90px; font-size: 34px;
    animation: rise 2.6s ease-out forwards;
  }
  .float .who { display:block; font-size:11px; text-align:center; color:var(--ink); opacity:.8; margin-top:2px; font-family:var(--sans); }
  @keyframes rise {
    0%   { transform: translateY(0) scale(0.6); opacity: 0; }
    12%  { transform: translateY(-14px) scale(1.1); opacity: 1; }
    100% { transform: translateY(-230px) scale(1); opacity: 0; }
  }

  @media (max-width: 620px) {
    .calls { right: 14px; bottom: 92px; }
    .cam { width: 118px; }
    .cam.local { width: 92px; }
    .together { width: 100%; margin-left: 0; order: 5; }
    h1 { font-size: 34px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .float { animation-duration: 1.6s; }
    .spark { animation: none !important; opacity: 0 !important; }
    * { transition: none !important; }
  }

  /* ---------- Reaction polish: sparkle trail + combo burst ---------- */
  .float .spark {
    position: absolute; left: 50%; top: 50%;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--lamp-soft);
    box-shadow: 0 0 6px 1px rgba(243,181,106,0.8);
    animation: spark-burst 0.9s ease-out forwards;
    animation-delay: var(--d, 0s);
  }
  @keyframes spark-burst {
    0%   { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(0); opacity: 0; }
  }
  .float.mega { font-size: 54px; }
  .combo-banner {
    position: absolute; bottom: 130px; left: 50%; transform: translateX(-50%);
    font-family: var(--serif); font-size: 15px; color: var(--lamp-soft);
    background: rgba(21,18,29,0.6); padding: 6px 16px; border-radius: 100px;
    backdrop-filter: blur(4px);
    animation: rise 2.2s ease-out forwards;
    white-space: nowrap;
  }

  /* ---------- Duration-mismatch banner ---------- */
  .warnBar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 8;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(232,127,149,0.16);
    border-bottom: 1px solid rgba(232,127,149,0.4);
    color: var(--ink); font-size: 13px;
    padding: 9px 14px; text-align: center;
  }
  .warnBar button {
    background: none; border: 1px solid rgba(255,255,255,0.25); color: var(--ink);
    border-radius: 8px; padding: 3px 10px; font-size: 12px; flex-shrink: 0;
  }

  /* ---------- Now-playing title card ---------- */
  .titleCard {
    position: absolute; top: 16px; left: 16px; z-index: 7;
    max-width: 62%;
    background: rgba(21,18,29,0.55);
    backdrop-filter: blur(6px);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 9px 16px;
    pointer-events: none;
    transition: opacity .6s ease;
  }
  .titleMain {
    font-family: var(--serif); font-size: 17px; color: var(--ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .titleSub { font-size: 12px; color: var(--lamp-soft); margin-top: 2px; }

  /* ---------- Session recap ---------- */
  .recapOverlay {
    position: fixed; inset: 0; z-index: 40;
    display: grid; place-items: center;
    background: rgba(21,18,29,0.72); backdrop-filter: blur(4px);
    padding: 20px;
  }
  .recapCard {
    width: 100%; max-width: 380px;
    background: linear-gradient(180deg, var(--panel), var(--night-2));
    border: 1px solid var(--line); border-radius: 20px;
    padding: 30px 28px; text-align: center;
    box-shadow: 0 30px 80px -30px rgba(0,0,0,0.7);
  }
  .recapCard h2 { font-family: var(--serif); font-weight: 500; font-size: 24px; margin: 0 0 18px; }
  .recapStats { display: flex; justify-content: center; gap: 26px; margin-bottom: 18px; }
  .recapStats div { display: flex; flex-direction: column; }
  .recapStats .num { font-family: var(--serif); font-size: 26px; color: var(--lamp-soft); }
  .recapStats .lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .recapQuote { font-size: 13px; color: var(--muted); font-style: italic; margin: 0 0 22px; line-height: 1.5; }
  .recapCard button {
    border: none; border-radius: 12px; padding: 12px 22px;
    font-size: 14px; font-weight: 600; color: #2a1a06;
    background: linear-gradient(180deg, var(--lamp-soft), var(--lamp));
  }

  /* ---------- Ambient dimming when idle (movie-theater feel) ----------
     Snap back to full visibility fast on any activity (short transition on
     the base rule), but fade out slowly and completely once idle (long
     transition on the .idle rule) — the browser always animates using the
     duration on the state being transitioned *into*, so this pair gives an
     asymmetric fast-in/slow-out fade for free. */
  .topbar, .dock, .fsBar, .calls, .titleCard { transition: opacity .35s ease; }
  #app.idle .topbar, #app.idle .dock, #app.idle .fsBar, #app.idle .calls, #app.idle .titleCard {
    opacity: 0;
    transition: opacity 5s ease;
  }
</style>
</head>
<body>

  <button id="themeToggle" class="themeToggle" type="button" title="Switch theme">🌙</button>

  <!-- SETUP -->
  <section id="setup">
    <div class="card">
      <div class="lamp-mark"><i class="dot"></i><span>WATCH TOGETHER</span></div>
      <h1>A little <span class="em">room</span><br>for just the two of you.</h1>
      <p class="sub">Open the same movie on both your screens. Playback stays in step, your voices carry, and it feels a bit less far.</p>

      <div class="field">
        <label for="name">Your name</label>
        <input id="name" type="text" placeholder="e.g. Kaycee" autocomplete="off" />
      </div>
      <div class="field">
        <label for="room">Room code — share it with your person</label>
        <input id="room" type="text" placeholder="e.g. our-night-in" autocomplete="off" />
      </div>
      <button class="join" id="joinBtn">Open the room</button>
      <p class="fineprint">You'll be asked for mic &amp; camera so you can hear each other. Voice starts on, camera starts off — turn it on whenever. Once inside, load your own copy of a local file (you'll both need the same one) or paste a YouTube link, which loads for both of you at once.</p>
    </div>
  </section>

  <!-- APP -->
  <section id="app" class="hidden">
    <div class="topbar">
      <div class="brand"><i class="dot"></i> Watch Together</div>
      <div class="status" id="status"><i class="pill"></i><span id="statusText">Waiting for your person…</span></div>
      <button class="invite" id="inviteBtn">Copy invite link</button>
      <button class="invite" id="chatBtn">💬 Chat<span class="badge hidden" id="chatBadge">0</span></button>
      <div class="together"><span class="label">together for</span><span id="timer">00:00</span></div>
    </div>

    <div class="middle">
      <div class="stage">
        <div class="screen">
          <div class="warnBar hidden" id="warnBar">
            <span id="warnText"></span>
            <button id="warnClose" type="button">Dismiss</button>
          </div>
          <div class="titleCard hidden" id="titleCard">
            <div class="titleMain" id="titleMain"></div>
            <div class="titleSub hidden" id="titleSub"></div>
          </div>
          <video id="video" playsinline controls></video>
          <div id="ytPlayer" class="hidden"></div>

          <div class="empty" id="empty">
            <div class="inner">
              <h2>Load something to watch</h2>
              <p>Pick your own copy from this device, or watch a YouTube video together — either way, playback stays in sync.</p>
              <div class="sourceChoices">
                <label class="load">📁 Choose file<input id="file" type="file" accept="video/*" hidden></label>
                <button class="load" id="ytOpenBtn" type="button">▶️ YouTube</button>
              </div>
            </div>
          </div>

          <div class="tap hidden" id="tap">
            <button id="tapBtn">Tap to sync ▶</button>
          </div>
        </div>

        <div class="calls" id="calls">
          <div class="cam" id="remoteWrap">
            <video id="remoteVideo" autoplay playsinline></video>
            <div class="off" id="remoteOff">◍</div>
            <div class="tag" id="remoteTag">Partner</div>
          </div>
          <div class="cam local" id="localWrap">
            <video id="localVideo" autoplay playsinline muted></video>
            <div class="off" id="localOff">You</div>
            <div class="tag">You</div>
          </div>
        </div>

        <div id="floatsFS" class="floats-fs"></div>

        <div class="fsBar" id="fsBar">
          <button class="ctrl" id="micBtnFS">🎙 Mic on</button>
          <button class="ctrl off" id="camBtnFS">📷 Camera off</button>
          <div class="reacts" id="reactsFS">
            <button data-e="❤️">❤️</button>
            <button data-e="😂">😂</button>
            <button data-e="😮">😮</button>
            <button data-e="😍">😍</button>
            <button data-e="🥹">🥹</button>
            <button data-e="👏">👏</button>
          </div>
          <button class="invite" id="chatBtnFS">💬 Chat<span class="badge hidden" id="chatBadgeFS">0</span></button>
          <button class="ctrl" id="camsToggleFS">🫥 Hide cams</button>
          <button class="ctrl" id="ytOpenBtnFS" type="button">▶️ YouTube</button>
        </div>
      </div>

      <div class="chatPanel closed" id="chatPanel">
        <div class="chatHead"><span>Chat</span><button id="chatClose" type="button">✕</button></div>
        <div class="chatLog" id="chatLog"></div>
        <form class="chatForm" id="chatForm">
          <input id="chatInput" type="text" placeholder="Say something…" autocomplete="off" maxlength="500" />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>

    <div class="dock">
      <label class="ctrl primary">Load file<input id="file2" type="file" accept="video/*" hidden></label>
      <button class="ctrl primary" id="ytOpenBtn2" type="button">▶️ YouTube</button>
      <button class="ctrl" id="micBtn">🎙 Mic on</button>
      <button class="ctrl off" id="camBtn">📷 Camera off</button>
      <button class="ctrl" id="camsToggle">🫥 Hide cams</button>
      <div class="reacts" id="reacts">
        <button data-e="❤️">❤️</button>
        <button data-e="😂">😂</button>
        <button data-e="😮">😮</button>
        <button data-e="😍">😍</button>
        <button data-e="🥹">🥹</button>
        <button data-e="👏">👏</button>
      </div>
    </div>
  </section>

  <div id="floats"></div>

  <div class="recapOverlay hidden" id="recap">
    <div class="recapCard">
      <h2>That was nice.</h2>
      <div class="recapStats">
        <div><span class="num" id="recapTime">00:00</span><span class="lbl">together</span></div>
        <div><span class="num" id="recapReacts">0</span><span class="lbl">reactions</span></div>
      </div>
      <p class="recapQuote hidden" id="recapQuote"></p>
      <button id="recapClose" type="button">Close</button>
    </div>
  </div>

  <div class="ytOverlay hidden" id="ytOverlay">
    <div class="ytCard">
      <h2>Watch a YouTube video together</h2>
      <p class="ytSub">Paste a link — it loads for both of you at once.</p>
      <input id="ytUrl" type="text" placeholder="https://youtube.com/watch?v=…" autocomplete="off" />
      <p class="ytHint hidden" id="ytHint">Couldn't find a video in that link — try pasting the full URL.</p>
      <div class="ytActions">
        <button id="ytCancelBtn" type="button">Cancel</button>
        <button id="ytLoadBtn" type="button">Load</button>
      </div>
    </div>
  </div>

<script src="https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
<script>
(function () {
  'use strict';

  // ---- tiny helpers ----
  function $(id) { return document.getElementById(id); }
  var ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Free public TURN relay (Open Relay Project) — kicks in only when a direct
      // peer-to-peer connection isn't possible (e.g. one of you is behind carrier-
      // grade NAT or a strict router). Fine for occasional personal use; swap in
      // your own TURN server if it ever feels slow or unavailable.
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };

  // Consistent-looking emoji across Windows/Mac/mobile instead of each OS's own font.
  var TWEMOJI_OPTS = { base: 'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/', folder: 'svg', ext: '.svg' };
  function twem(el) { if (window.twemoji) { twemoji.parse(el, TWEMOJI_OPTS); } }

  // Two palettes sharing the same CSS variables, so swapping the attribute
  // re-themes everything at once. Applied immediately so there's no flash.
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeToggle').textContent = theme === 'moonlight' ? '☀️' : '🌙';
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem('wt_theme'); } catch (e) {}
  applyTheme(savedTheme === 'moonlight' ? 'moonlight' : 'lamp');
  $('themeToggle').addEventListener('click', function () {
    var next = (document.documentElement.getAttribute('data-theme') === 'moonlight') ? 'lamp' : 'moonlight';
    applyTheme(next);
    try { localStorage.setItem('wt_theme', next); } catch (e) {}
  });

  // Remember the last room/name used on this device so reopening the page doesn't
  // require retyping — an invite link's room code still wins over this.
  try {
    var saved = JSON.parse(localStorage.getItem('wt_last') || 'null');
    if (saved) {
      if (saved.name) { $('name').value = saved.name; }
      if (saved.room) { $('room').value = saved.room; }
    }
  } catch (e) {}

  // Prefill room from the URL hash so an invite link "just works".
  if (location.hash.length > 1) {
    $('room').value = decodeURIComponent(location.hash.slice(1));
  }

  var state = {
    ws: null, pc: null, localStream: null,
    room: '', name: 'Partner', myId: '', initiator: false,
    connected: false, offset: 0, minRtt: Infinity,
    applyingRemote: false, remoteClearTimer: null,
    rateResetTimer: null, sinceTs: 0, timerInt: null,
    reactionCount: 0, firstChatMsg: null,
    myLastReact: null, peerLastReact: null, comboFired: false, comboResetTimer: null,
    myDuration: null, peerDuration: null, peerName: null
  };

  var video = $('video');
  twem(document.body);

  // ===================================================================
  //  JOIN
  // ===================================================================
  $('joinBtn').addEventListener('click', join);
  $('room').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });

  function join() {
    var room = $('room').value.trim();
    if (!room) { $('room').focus(); return; }
    state.room = room;
    state.name = ($('name').value.trim() || 'Partner');
    location.hash = encodeURIComponent(room);
    try { localStorage.setItem('wt_last', JSON.stringify({ room: room, name: state.name })); } catch (e) {}
    if (window.Notification && Notification.permission === 'default') { Notification.requestPermission(); }

    getMedia().then(function () {
      setupPeer();
      openSocket();
      $('setup').classList.add('hidden');
      $('app').classList.remove('hidden');
    });
  }

  // ===================================================================
  //  MEDIA (mic on, camera off by default)
  // ===================================================================
  function getMedia() {
    var opts = { audio: { echoCancellation: true, noiseSuppression: true }, video: { width: 640, height: 480 } };
    return navigator.mediaDevices.getUserMedia(opts)
      .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }).catch(function () { return null; }); })
      .then(function (stream) {
        state.localStream = stream;
        if (!stream) { setMicUI(false, true); setCamUI(false, true); return; }
        $('localVideo').srcObject = stream;
        var v = stream.getVideoTracks()[0];
        if (v) { v.enabled = false; }          // start with camera off
        setCamUI(false, !v);
        setMicUI(true, false);
        $('localOff').classList.remove('hidden'); // camera off => show "You"
      });
  }

  // ===================================================================
  //  WEBSOCKET SIGNALLING + CONTROL RELAY
  // ===================================================================
  function openSocket() {
    var proto = (location.protocol === 'https:') ? 'wss://' : 'ws://';
    var ws = new WebSocket(proto + location.host);
    state.ws = ws;

    ws.addEventListener('open', function () {
      send({ type: 'join', room: state.room, name: state.name });
      pingLoop();
    });

    ws.addEventListener('message', function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handle(msg);
    });

    ws.addEventListener('close', function () {
      setStatus(false, 'Reconnecting…');
      setTimeout(openSocket, 1500);
    });
  }

  function send(obj) {
    if (state.ws && state.ws.readyState === 1) { state.ws.send(JSON.stringify(obj)); }
  }

  function handle(msg) {
    // Learn the partner's real name from whichever message tells us first,
    // so "Partner" only ever shows before we actually know who they are.
    if (msg.fromName && msg.fromName !== state.peerName) {
      state.peerName = msg.fromName;
      updateRemoteTag();
    }

    switch (msg.type) {
      case 'joined':
        state.myId = msg.id;
        state.initiator = msg.initiator;
        if (msg.peerName) { state.peerName = msg.peerName; updateRemoteTag(); }
        if (msg.peers >= 2) { onBothHere(); }
        break;

      case 'presence':
        if (msg.peers >= 2) { onBothHere(); } else { onAlone(); }
        break;

      case 'peer-joined':
        // Someone just arrived. The first person present drives the call
        // and shares the current playback position.
        if (msg.name) { state.peerName = msg.name; updateRemoteTag(); }
        if (state.initiator) { makeOffer(); sendSnapshot(); }
        break;

      case 'peer-left':
        onAlone();
        break;

      case 'pong': {
        var now = Date.now();
        var rtt = now - msg.t0;
        if (rtt < state.minRtt) {          // keep the best (lowest-latency) sample
          state.minRtt = rtt;
          state.offset = (msg.ts + rtt / 2) - now;  // ~ shared clock with the server
        }
        break;
      }

      // ---- WebRTC ----
      case 'offer':
        state.pc.setRemoteDescription(msg.sdp)
          .then(function () { return state.pc.createAnswer(); })
          .then(function (a) { return state.pc.setLocalDescription(a); })
          .then(function () { send({ type: 'answer', sdp: state.pc.localDescription }); });
        break;
      case 'answer':
        state.pc.setRemoteDescription(msg.sdp);
        break;
      case 'ice':
        if (msg.candidate) { state.pc.addIceCandidate(msg.candidate).catch(function () {}); }
        break;

      // ---- playback ----
      case 'control': applyControl(msg); break;
      case 'sync': applyDrift(msg); break;
      case 'request-sync': if (media.isReady()) sendSnapshot(); break;
      case 'reaction': registerReaction(msg.emoji, false); floatReaction(msg.emoji, msg.fromName, msg.mega); break;
      case 'chat': addChatMessage(msg.fromName, msg.text, false); bumpUnread(); break;
      case 'meta': state.peerDuration = msg.duration; checkDurationMismatch(); break;
      case 'load-youtube': loadYouTube(msg.videoId, false); break;
    }
  }

  // ===================================================================
  //  SHARED CLOCK (so play/seek land at the same real moment)
  // ===================================================================
  function pingLoop() {
    send({ type: 'ping', t0: Date.now() });
    setTimeout(pingLoop, 5000);
  }
  function syncedNow() { return Date.now() + state.offset; }

  // ===================================================================
  //  PEER CONNECTION
  // ===================================================================
  function setupPeer() {
    var pc = new RTCPeerConnection(ICE);
    state.pc = pc;
    if (state.localStream) {
      state.localStream.getTracks().forEach(function (t) { pc.addTrack(t, state.localStream); });
    }
    pc.onicecandidate = function (e) { if (e.candidate) send({ type: 'ice', candidate: e.candidate }); };
    pc.ontrack = function (e) {
      $('remoteVideo').srcObject = e.streams[0];
      var vt = e.streams[0].getVideoTracks()[0];
      showRemoteVideo(vt && vt.enabled);
      if (vt) {
        vt.onmute = function () { showRemoteVideo(false); };
        vt.onunmute = function () { showRemoteVideo(true); };
      }
    };
  }

  function makeOffer() {
    state.pc.createOffer()
      .then(function (o) { return state.pc.setLocalDescription(o); })
      .then(function () { send({ type: 'offer', sdp: state.pc.localDescription }); });
  }

  // ===================================================================
  //  MEDIA ADAPTER — the exact same sync logic below drives either a local
  //  <video> file or an embedded YouTube player; only how we read/set time
  //  and play/pause differs between the two, so everything else (control
  //  messages, drift correction, snapshots) is written once against the
  //  media object instead of touching the video element directly.
  // ===================================================================
  var ytPlayer = null;
  var ytReady = false;

  var nativeMedia = {
    kind: 'video',
    isReady: function () { return !!video.src; },
    getTime: function () { return video.currentTime; },
    setTime: function (t) { video.currentTime = t; },
    isPaused: function () { return video.paused; },
    play: function () { return video.play(); },
    pause: function () { video.pause(); },
    getDuration: function () { return video.duration; },
    setRate: function (r) { video.playbackRate = r; }
  };
  var youtubeMedia = {
    kind: 'youtube',
    isReady: function () { return ytReady && !!ytPlayer; },
    getTime: function () { return ytPlayer ? ytPlayer.getCurrentTime() : 0; },
    setTime: function (t) { if (ytPlayer) ytPlayer.seekTo(t, true); },
    isPaused: function () { return !ytPlayer || ytPlayer.getPlayerState() !== 1; },
    play: function () { if (ytPlayer) ytPlayer.playVideo(); },
    pause: function () { if (ytPlayer) ytPlayer.pauseVideo(); },
    getDuration: function () { return ytPlayer ? ytPlayer.getDuration() : NaN; },
    setRate: function () { /* YouTube only allows discrete rates — skip the fine easing */ }
  };
  var media = nativeMedia;

  // ===================================================================
  //  PLAYBACK SYNC
  // ===================================================================
  // Guard so applying a remote action doesn't echo back as our own event.
  function withRemote(fn) {
    state.applyingRemote = true;
    try { fn(); } finally {
      clearTimeout(state.remoteClearTimer);
      state.remoteClearTimer = setTimeout(function () { state.applyingRemote = false; }, 260);
    }
  }

  video.addEventListener('play', function () { if (!state.applyingRemote && media.kind === 'video') sendControl('play'); });
  video.addEventListener('pause', function () { if (!state.applyingRemote && media.kind === 'video') sendControl('pause'); });
  video.addEventListener('seeked', function () { if (!state.applyingRemote && media.kind === 'video') sendControl('seek'); });

  function sendControl(kind) {
    send({ type: 'control', kind: kind, mediaTime: media.getTime(), at: syncedNow() });
  }

  function sendSnapshot() {
    // bring a late joiner to the current spot, playing or paused
    send({ type: 'control', kind: media.isPaused() ? 'pause' : 'play', mediaTime: media.getTime(), at: syncedNow() });
  }

  function applyControl(msg) {
    if (!media.isReady()) { return; }
    var delay = Math.max(0, (syncedNow() - msg.at) / 1000);
    withRemote(function () {
      if (msg.kind === 'play') {
        media.setTime(msg.mediaTime + delay);
        var p = media.play();
        if (p && p.catch) { p.catch(function () { showTap(true); }); }
      } else if (msg.kind === 'pause') {
        media.setTime(msg.mediaTime);
        media.pause();
      } else if (msg.kind === 'seek') {
        media.setTime(msg.mediaTime + (media.isPaused() ? 0 : delay));
      }
    });
  }

  // Only the initiator broadcasts the heartbeat; the other follows it, so the
  // two never fight each other over who's "right".
  setInterval(function () {
    if (state.initiator && state.connected && !media.isPaused() && media.isReady()) {
      send({ type: 'sync', mediaTime: media.getTime(), at: syncedNow() });
    }
  }, 3000);

  function applyDrift(msg) {
    if (state.initiator || media.isPaused() || !media.isReady()) { return; }
    var delay = (syncedNow() - msg.at) / 1000;
    var target = msg.mediaTime + delay;
    var drift = target - media.getTime();
    var mag = Math.abs(drift);
    if (media.kind === 'youtube') {
      // No arbitrary playback-rate easing on YouTube — just hard-correct past a gap.
      if (mag > 1.5) { withRemote(function () { media.setTime(target); }); }
      return;
    }
    if (mag > 1.5) {
      withRemote(function () { media.setTime(target); });
      media.setRate(1);
    } else if (mag > 0.15) {
      // ease back into sync instead of a visible jump
      media.setRate(drift > 0 ? 1.05 : 0.95);
      clearTimeout(state.rateResetTimer);
      state.rateResetTimer = setTimeout(function () { media.setRate(1); }, Math.min(4000, (mag / 0.05) * 1000));
    } else {
      media.setRate(1);
    }
  }

  // ===================================================================
  //  FILE PICKING
  // ===================================================================
  // Switching between a local file and YouTube reuses the same stage, so
  // only one of <video>/#ytPlayer is ever visible or "live" at a time.
  function switchToNativeVideo() {
    if (media.kind === 'youtube' && ytPlayer) {
      withRemote(function () { ytPlayer.pauseVideo(); });
    }
    media = nativeMedia;
    video.classList.remove('hidden');
    $('ytPlayer').classList.add('hidden');
  }

  function onPick(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    switchToNativeVideo();
    if (video.src) { URL.revokeObjectURL(video.src); }
    state.myDuration = null;
    $('warnBar').classList.add('hidden');
    video.src = URL.createObjectURL(f);
    $('empty').classList.add('hidden');
    showTitleCard(f.name);
    // Our partner may already be mid-movie; ask them where we should be.
    send({ type: 'request-sync' });
  }
  $('file').addEventListener('change', onPick);
  $('file2').addEventListener('change', onPick);

  // ===================================================================
  //  NOW-PLAYING TITLE — cleaned up from the raw filename, TV shows get
  //  their season/episode pulled out too.
  // ===================================================================
  // Note: this whole page is a JS template literal on the server, so every
  // backslash below is doubled — a single \b would otherwise get silently
  // eaten (or turned into a real backspace character) before it ever
  // reaches the browser.
  var JUNK_TOKENS = /\\b(1080p|720p|2160p|4k|480p|webrip|web[- .]?dl|blu[- .]?ray|brrip|bdrip|dvdrip|hdtv|hdrip|hdcam|camrip|x264|x265|h264|h265|hevc|avc|aac(?:2\\.0)?|ac3|dts(?:-hd)?|5\\.1|7\\.1|10bit|8bit|repack|proper|extended|remastered|uncut|unrated|director'?s|theatrical|cut|multi|dual audio|subbed|dubbed|internal|limited|complete)\\b/gi;

  function stripJunk(str) {
    var s = str.replace(/-[A-Za-z0-9]{2,15}$/, '');    // trailing -RELEASEGROUP
    s = s.replace(/[\\[\\(\\{].*?[\\]\\)\\}]/g, ' ');   // bracketed/parenthetical notes
    s = s.replace(JUNK_TOKENS, ' ');
    s = s.replace(/[._]+/g, ' ');
    s = s.replace(/-+/g, ' ');
    s = s.replace(/\\s{2,}/g, ' ').trim();
    return s;
  }

  // Scene releases are often ALL CAPS or all lowercase with no real casing —
  // tidy those up, but leave a filename that already has mixed case alone.
  function tidyCase(s) {
    if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
    var minor = { a: 1, an: 1, the: 1, of: 1, in: 1, on: 1, at: 1, to: 1, and: 1, or: 1, for: 1, vs: 1 };
    return s.toLowerCase().split(' ').map(function (w, i) {
      if (!w) return w;
      return (i > 0 && minor[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function parseMediaTitle(filename) {
    var name = filename.replace(/\\.[a-z0-9]{2,5}$/i, '');                       // drop extension
    name = name.replace(/^\\s*www\\.[^\\s]+?\\.[a-z]{2,4}\\s*[-–—]\\s*/i, '');    // leading site plug

    var tv = name.match(/^(.*?)[\\s._-]*[Ss](\\d{1,2})[\\s._-]*[Ee](\\d{1,3})\\b/) ||
             name.match(/^(.*?)[\\s._-]*(\\d{1,2})x(\\d{2,3})\\b/);
    if (tv) {
      return { type: 'tv', title: tidyCase(stripJunk(tv[1])) || filename, season: parseInt(tv[2], 10), episode: parseInt(tv[3], 10) };
    }

    var withYear = name.match(/^(.*?)[\\s._(\\[-]((?:19|20)\\d{2})\\b/);
    if (withYear) {
      return { type: 'movie', title: tidyCase(stripJunk(withYear[1])) || filename, year: withYear[2] };
    }

    return { type: 'movie', title: tidyCase(stripJunk(name)) || name, year: null };
  }

  function showTitleCard(filename) {
    var info = parseMediaTitle(filename);
    showTitleCardDirect((info.type === 'movie' && info.year) ? (info.title + ' (' + info.year + ')') : info.title,
      info.type === 'tv' ? ('Season ' + info.season + ' · Episode ' + info.episode) : null);
  }

  // Used directly for YouTube, where we get a real title from oEmbed instead
  // of having to guess one from a filename.
  function showTitleCardDirect(main, sub) {
    $('titleMain').textContent = main;
    var subEl = $('titleSub');
    if (sub) { subEl.textContent = sub; subEl.classList.remove('hidden'); }
    else { subEl.classList.add('hidden'); }
    $('titleCard').classList.remove('hidden');
  }

  // Warn if the two files are probably different cuts/versions of the movie.
  video.addEventListener('loadedmetadata', function () {
    state.myDuration = video.duration;
    send({ type: 'meta', duration: video.duration });
    checkDurationMismatch();
  });
  function checkDurationMismatch() {
    var a = state.myDuration, b = state.peerDuration;
    if (!a || !b || !isFinite(a) || !isFinite(b)) { $('warnBar').classList.add('hidden'); return; }
    var diff = Math.abs(a - b);
    if (diff > 3) {
      $('warnText').textContent = 'Heads up — your files might be different versions (durations differ by ' + Math.round(diff) + 's).';
      $('warnBar').classList.remove('hidden');
    } else {
      $('warnBar').classList.add('hidden');
    }
  }
  $('warnClose').addEventListener('click', function () { $('warnBar').classList.add('hidden'); });

  // ===================================================================
  //  YOUTUBE — an alternate source alongside local files. One of you
  //  pastes a link, it loads for both of you, and the same sync engine
  //  above drives it exactly like a local file would.
  // ===================================================================
  var ytApiCallbacks = [];
  function ensureYouTubeAPI(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    ytApiCallbacks.push(cb);
    if (window.YT || document.getElementById('ytApiScript')) { return; } // already loading
    var s = document.createElement('script');
    s.id = 'ytApiScript';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = function () {
      ytApiCallbacks.forEach(function (fn) { fn(); });
      ytApiCallbacks = [];
    };
  }

  function extractYouTubeId(input) {
    var s = (input || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) { return s; } // a bare video ID
    var m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
            s.match(/youtu\\.be\\/([A-Za-z0-9_-]{11})/) ||
            s.match(/\\/(?:embed|shorts)\\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function switchToYouTube() {
    if (media.kind === 'video') { withRemote(function () { video.pause(); }); }
    media = youtubeMedia;
    video.classList.add('hidden');
    $('ytPlayer').classList.remove('hidden');
    $('empty').classList.add('hidden');
    $('warnBar').classList.add('hidden');
    state.myDuration = null;
  }

  function loadYouTube(videoId, announce) {
    switchToYouTube();
    ytReady = false;
    ensureYouTubeAPI(function () {
      if (ytPlayer) {
        ytPlayer.loadVideoById(videoId);
      } else {
        ytPlayer = new YT.Player('ytPlayer', {
          videoId: videoId,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: function () {
              ytReady = true;
              var d = ytPlayer.getDuration();
              if (d) { state.myDuration = d; send({ type: 'meta', duration: d }); checkDurationMismatch(); }
            },
            onStateChange: function (e) {
              if (state.applyingRemote) return;
              if (e.data === 1) { sendControl('play'); }        // YT.PlayerState.PLAYING
              else if (e.data === 2) { sendControl('pause'); }  // YT.PlayerState.PAUSED
            }
          }
        });
      }
    });

    // Fetch the real title via YouTube's public oEmbed endpoint — no API key needed.
    showTitleCardDirect('YouTube video', null);
    fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.title) { showTitleCardDirect(data.title, null); } })
      .catch(function () {});

    if (announce) { send({ type: 'load-youtube', videoId: videoId }); }
    send({ type: 'request-sync' });
  }

  function openYtModal() {
    $('ytHint').classList.add('hidden');
    $('ytOverlay').classList.remove('hidden');
    $('ytUrl').focus();
  }
  function closeYtModal() { $('ytOverlay').classList.add('hidden'); }

  [$('ytOpenBtn'), $('ytOpenBtn2'), $('ytOpenBtnFS')].forEach(function (b) {
    b.addEventListener('click', openYtModal);
  });
  $('ytCancelBtn').addEventListener('click', closeYtModal);
  $('ytLoadBtn').addEventListener('click', submitYtUrl);
  $('ytUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitYtUrl(); });

  function submitYtUrl() {
    var id = extractYouTubeId($('ytUrl').value);
    if (!id) { $('ytHint').classList.remove('hidden'); return; }
    loadYouTube(id, true);
    closeYtModal();
  }

  // ===================================================================
  //  CONTROLS: mic / camera / reactions / tap-to-sync / invite
  // ===================================================================
  // Wired to two buttons each — the normal dock, and the floating fullscreen
  // toolbar — so mic/camera stay reachable in either mode.
  function toggleMic() {
    if (!state.localStream) return;
    var t = state.localStream.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicUI(t.enabled, false);
  }
  function toggleCam() {
    if (!state.localStream) return;
    var t = state.localStream.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamUI(t.enabled, false);
    $('localOff').classList.toggle('hidden', t.enabled);
  }
  $('micBtn').addEventListener('click', toggleMic);
  $('camBtn').addEventListener('click', toggleCam);
  $('micBtnFS').addEventListener('click', toggleMic);
  $('camBtnFS').addEventListener('click', toggleCam);

  // Webcam thumbnails are handy but can sit over part of the movie — 'V' (or
  // either "Hide cams" button) clears them instantly; pressing again brings
  // them back exactly where they were.
  function setCallsToggleUI(hidden) {
    var label = hidden ? '👀 Show cams' : '🫥 Hide cams';
    [$('camsToggle'), $('camsToggleFS')].forEach(function (b) { b.textContent = label; });
  }
  function toggleCallsVisible() {
    var hidden = $('calls').classList.toggle('hidden');
    setCallsToggleUI(hidden);
  }
  $('camsToggle').addEventListener('click', toggleCallsVisible);
  $('camsToggleFS').addEventListener('click', toggleCallsVisible);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'v' && e.key !== 'V') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    toggleCallsVisible();
  });

  // Left/right arrow keys fast-rewind / fast-forward the movie (10s per press).
  // Skipped while typing in a text field so it doesn't fight the room/name inputs.
  var SEEK_STEP = 10;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!media.isReady()) return;
    e.preventDefault();
    var t;
    if (e.key === 'ArrowLeft') {
      t = Math.max(0, media.getTime() - SEEK_STEP);
    } else {
      var target = media.getTime() + SEEK_STEP;
      var dur = media.getDuration();
      t = isNaN(dur) ? target : Math.min(target, dur);
    }
    media.setTime(t);
    // Native <video> fires its own 'seeked' event to broadcast this; YouTube has no
    // such event, so tell our partner directly.
    if (media.kind === 'youtube') { sendControl('seek'); }
  });

  // 'F' toggles fullscreen for the whole stage — video, webcams, and the
  // floating chat/reactions toolbar all live inside it so nothing becomes
  // unreachable once the browser chrome disappears.
  var stageEl = document.querySelector('.stage');
  var middleEl = document.querySelector('.middle');
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'f' && e.key !== 'F') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!media.isReady()) return;
    e.preventDefault();
    var isFull = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFull) {
      var req = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen;
      if (req) { req.call(stageEl); }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { exit.call(document); }
    }
  });

  // The chat panel normally lives beside the video (see .middle); while
  // fullscreen it moves inside the stage so it can float over the video
  // instead of vanishing outside the fullscreen element entirely.
  function onFullscreenChange() {
    var chatPanel = $('chatPanel');
    var full = document.fullscreenElement || document.webkitFullscreenElement;
    if (full === stageEl) {
      stageEl.appendChild(chatPanel);
    } else if (chatPanel.parentElement !== middleEl) {
      middleEl.appendChild(chatPanel);
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // Tap a reaction to send it; hold it down for a bigger "mega" version.
  // Wired to both the normal dock and the floating fullscreen toolbar.
  var REACT_COMBO_WINDOW = 2500;
  function wireReactButtons(buttons) {
    buttons.forEach(function (b) {
      var pressTimer = null, isMega = false;
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      b.addEventListener('pointerdown', function () {
        isMega = false;
        pressTimer = setTimeout(function () { isMega = true; }, 450);
      });
      b.addEventListener('pointerup', function () {
        clearTimeout(pressTimer);
        var e = b.getAttribute('data-e');
        registerReaction(e, true);
        floatReaction(e, state.name, isMega);
        send({ type: 'reaction', emoji: e, mega: isMega });
      });
      b.addEventListener('pointerleave', function () { clearTimeout(pressTimer); });
    });
  }
  wireReactButtons(document.querySelectorAll('#reacts button'));
  wireReactButtons(document.querySelectorAll('#reactsFS button'));

  // If you and your partner send the same reaction within a couple seconds,
  // celebrate the "in sync" moment with a bigger banner.
  function registerReaction(emoji, mine) {
    state.reactionCount += 1;
    var now = Date.now();
    if (mine) { state.myLastReact = { emoji: emoji, at: now }; }
    else { state.peerLastReact = { emoji: emoji, at: now }; }
    var a = state.myLastReact, b = state.peerLastReact;
    if (a && b && a.emoji === emoji && b.emoji === emoji &&
        Math.abs(a.at - b.at) < REACT_COMBO_WINDOW && !state.comboFired) {
      state.comboFired = true;
      clearTimeout(state.comboResetTimer);
      state.comboResetTimer = setTimeout(function () { state.comboFired = false; }, REACT_COMBO_WINDOW);
      showCombo(emoji);
    }
  }

  // Reactions render into a viewport-wide layer normally, but that layer lives
  // outside the fullscreened stage — so while fullscreen, use the copy nested
  // inside the stage instead, or they'd be invisible.
  function activeFloats() {
    var full = document.fullscreenElement || document.webkitFullscreenElement;
    return (full === stageEl) ? $('floatsFS') : $('floats');
  }

  function showCombo(emoji) {
    var el = document.createElement('div');
    el.className = 'combo-banner';
    el.textContent = emoji + ' In sync ' + emoji;
    activeFloats().appendChild(el);
    twem(el);
    setTimeout(function () { el.remove(); }, 2300);
  }

  // ===================================================================
  //  TEXT CHAT (fallback for when the voice/video call won't connect)
  // ===================================================================
  function toggleChat() {
    var panel = $('chatPanel');
    var willShow = panel.classList.contains('closed');
    panel.classList.toggle('closed');
    if (willShow) { clearUnread(); playWhoosh(); $('chatInput').focus(); }
  }
  $('chatBtn').addEventListener('click', toggleChat);
  $('chatBtnFS').addEventListener('click', toggleChat);
  $('chatClose').addEventListener('click', function () { $('chatPanel').classList.add('closed'); });

  $('chatForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('chatInput');
    var text = input.value.trim();
    if (!text) return;
    addChatMessage(state.name, text, true);
    send({ type: 'chat', text: text });
    input.value = '';
  });

  // A deterministic color per person so their initial always looks the same.
  var AVATAR_COLORS = ['#f3b56a', '#e87f95', '#8fb8e0', '#9ad1a0', '#c9a0e8', '#e0c26a'];
  function nameColor(name) {
    var hash = 0;
    for (var i = 0; i < (name || '').length; i++) { hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function addChatMessage(name, text, mine) {
    if (!state.firstChatMsg) { state.firstChatMsg = { name: mine ? state.name : (name || 'Partner'), text: text }; }
    var displayName = mine ? 'You' : (name || 'Partner');
    var colorName = mine ? state.name : (name || 'Partner');
    var log = $('chatLog');

    var wrap = document.createElement('div');
    wrap.className = 'msg' + (mine ? ' mine' : '');

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = (colorName.trim().charAt(0) || '?').toUpperCase();
    avatar.style.background = nameColor(colorName);

    var content = document.createElement('div');
    content.className = 'content';
    var who = document.createElement('div');
    who.className = 'who';
    who.textContent = displayName;
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    content.appendChild(who);
    content.appendChild(bubble);

    wrap.appendChild(avatar);
    wrap.appendChild(content);
    log.appendChild(wrap);
    twem(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function bumpUnread() {
    if (!$('chatPanel').classList.contains('closed')) return;
    state.chatUnread = (state.chatUnread || 0) + 1;
    [$('chatBadge'), $('chatBadgeFS')].forEach(function (b) {
      b.textContent = state.chatUnread;
      b.classList.remove('hidden');
    });
  }
  function clearUnread() {
    state.chatUnread = 0;
    [$('chatBadge'), $('chatBadgeFS')].forEach(function (b) { b.classList.add('hidden'); });
  }

  $('tapBtn').addEventListener('click', function () {
    showTap(false);
    video.play();
  });

  $('inviteBtn').addEventListener('click', function () {
    var url = location.origin + location.pathname + '#' + encodeURIComponent(state.room);
    navigator.clipboard.writeText(url).then(function () {
      $('inviteBtn').textContent = 'Link copied ✓';
      setTimeout(function () { $('inviteBtn').textContent = 'Copy invite link'; }, 1800);
    });
  });

  // ===================================================================
  //  UI STATE
  // ===================================================================
  function setMicUI(on, missing) {
    var label = missing ? '🎙 No mic' : (on ? '🎙 Mic on' : '🔇 Mic off');
    [$('micBtn'), $('micBtnFS')].forEach(function (b) {
      b.textContent = label;
      b.classList.toggle('off', !on);
    });
  }
  function setCamUI(on, missing) {
    var label = missing ? '📷 No camera' : (on ? '📷 Camera on' : '📷 Camera off');
    [$('camBtn'), $('camBtnFS')].forEach(function (b) {
      b.textContent = label;
      b.classList.toggle('off', !on);
    });
  }
  function showRemoteVideo(on) {
    $('remoteOff').classList.toggle('hidden', !!on);
  }
  function showTap(on) { $('tap').classList.toggle('hidden', !on); }

  function setStatus(on, text) {
    $('status').classList.toggle('on', on);
    $('statusText').textContent = text;
  }

  function updateRemoteTag() {
    $('remoteTag').textContent = state.peerName || 'Partner';
  }

  // A brief WebSocket blip (flaky wifi, a laptop dimming its network on lock,
  // a free-tier host hiccup) shouldn't look like your partner left the room.
  // Give a real disconnect a few seconds to prove itself before showing the
  // recap card or resetting the session.
  var DISCONNECT_GRACE_MS = 8000;
  var disconnectGrace = null;

  function onBothHere() {
    if (disconnectGrace) {
      // They're back within the grace window — false alarm, resume as if nothing happened.
      clearTimeout(disconnectGrace);
      disconnectGrace = null;
      setStatus(true, state.peerName ? ('Together with ' + state.peerName) : 'Connected');
      updateRemoteTag();
      return;
    }
    if (state.connected) return;
    state.connected = true;
    state.reactionCount = 0;
    state.firstChatMsg = null;
    setStatus(true, state.peerName ? ('Together with ' + state.peerName) : 'Connected');
    updateRemoteTag();
    startTimer();
    playChime();
    if (document.hidden && window.Notification && Notification.permission === 'granted') {
      new Notification('Watch Together', { body: 'Your person is here 💛' });
    }
  }
  function onAlone() {
    if (!state.connected || disconnectGrace) return;
    setStatus(false, 'Reconnecting…');
    disconnectGrace = setTimeout(function () {
      disconnectGrace = null;
      showRecap();
      state.connected = false;
      setStatus(false, 'Waiting for your person…');
      showRemoteVideo(false);
      stopTimer();
    }, DISCONNECT_GRACE_MS);
  }

  // A soft two-tone chime when your person arrives, so you notice even if the
  // tab isn't focused.
  // Shared tiny synth for all the app's little sound cues — no audio files needed.
  function playTone(freqStart, freqEnd, duration, type, peakGain) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freqStart, ctx.currentTime);
      if (freqEnd && freqEnd !== freqStart) {
        o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration * 0.7);
      }
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(peakGain || 0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + duration);
      setTimeout(function () { ctx.close(); }, (duration + 0.2) * 1000);
    } catch (e) {}
  }
  function playChime() { playTone(660, 880, 0.5, 'sine', 0.2); }
  function playPop() { playTone(880, 660, 0.12, 'sine', 0.15); }
  function playWhoosh() { playTone(320, 900, 0.18, 'triangle', 0.1); }

  // A small souvenir card summarizing the session once your person disconnects.
  function showRecap() {
    var secs = Math.max(0, Math.floor((Date.now() - state.sinceTs) / 1000));
    var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    $('recapTime').textContent = (h > 0 ? h + ':' + two(m) : m) + ':' + two(s);
    $('recapReacts').textContent = state.reactionCount;
    var q = $('recapQuote');
    if (state.firstChatMsg) {
      q.textContent = '"' + state.firstChatMsg.text + '" — ' + state.firstChatMsg.name;
      q.classList.remove('hidden');
    } else {
      q.classList.add('hidden');
    }
    $('recap').classList.remove('hidden');
    twem($('recap'));
  }
  $('recapClose').addEventListener('click', function () { $('recap').classList.add('hidden'); });

  function startTimer() {
    if (state.timerInt) return;
    state.sinceTs = Date.now();
    state.timerInt = setInterval(function () {
      var s = Math.floor((Date.now() - state.sinceTs) / 1000);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      var two = function (n) { return (n < 10 ? '0' : '') + n; };
      $('timer').textContent = (h > 0 ? two(h) + ':' : '') + two(m) + ':' + two(sec);
    }, 1000);
  }
  function stopTimer() { clearInterval(state.timerInt); state.timerInt = null; }

  // ===================================================================
  //  FLOATING REACTIONS
  // ===================================================================
  function floatReaction(emoji, who, mega) {
    playPop();
    var el = document.createElement('div');
    el.className = 'float' + (mega ? ' mega' : '');
    el.style.left = (12 + Math.random() * 66) + '%';
    el.textContent = emoji;
    var sparkCount = mega ? 10 : 6;
    for (var i = 0; i < sparkCount; i++) {
      var s = document.createElement('span');
      s.className = 'spark';
      var angle = Math.random() * Math.PI * 2;
      var dist = 24 + Math.random() * 26;
      s.style.setProperty('--x', (Math.cos(angle) * dist).toFixed(1) + 'px');
      s.style.setProperty('--y', (Math.sin(angle) * dist).toFixed(1) + 'px');
      s.style.setProperty('--d', (Math.random() * 0.15).toFixed(2) + 's');
      el.appendChild(s);
    }
    if (who) {
      var w = document.createElement('span');
      w.className = 'who';
      w.textContent = who;
      el.appendChild(w);
    }
    activeFloats().appendChild(el);
    twem(el);
    setTimeout(function () { el.remove(); }, 2700);
  }

  // ===================================================================
  //  DRAGGABLE WEBCAM THUMBNAILS (drag them wherever isn't covering the movie)
  // ===================================================================
  (function () {
    var callsEl = $('calls');
    var dragging = false, offsetX = 0, offsetY = 0;

    function applySavedPosition() {
      try {
        var pos = JSON.parse(localStorage.getItem('wt_camsPos') || 'null');
        if (pos && isFinite(pos.leftPct) && isFinite(pos.topPct)) {
          callsEl.style.left = pos.leftPct + '%';
          callsEl.style.top = pos.topPct + '%';
          callsEl.style.right = 'auto';
          callsEl.style.bottom = 'auto';
        }
      } catch (e) {}
    }
    applySavedPosition();

    callsEl.addEventListener('pointerdown', function (e) {
      dragging = true;
      callsEl.classList.add('dragging');
      callsEl.setPointerCapture(e.pointerId);
      var rect = callsEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });

    callsEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var stageRect = stageEl.getBoundingClientRect();
      var x = e.clientX - stageRect.left - offsetX;
      var y = e.clientY - stageRect.top - offsetY;
      x = Math.max(0, Math.min(x, stageEl.clientWidth - callsEl.offsetWidth));
      y = Math.max(0, Math.min(y, stageEl.clientHeight - callsEl.offsetHeight));
      callsEl.style.left = x + 'px';
      callsEl.style.top = y + 'px';
      callsEl.style.right = 'auto';
      callsEl.style.bottom = 'auto';
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      callsEl.classList.remove('dragging');
      var leftPct = (callsEl.offsetLeft / stageEl.clientWidth) * 100;
      var topPct = (callsEl.offsetTop / stageEl.clientHeight) * 100;
      callsEl.style.left = leftPct + '%';
      callsEl.style.top = topPct + '%';
      try { localStorage.setItem('wt_camsPos', JSON.stringify({ leftPct: leftPct, topPct: topPct })); } catch (e) {}
    }
    callsEl.addEventListener('pointerup', endDrag);
    callsEl.addEventListener('pointercancel', endDrag);
  })();

  // ===================================================================
  //  AMBIENT DIMMING (theater-style — fades the chrome, not the movie, when idle)
  // ===================================================================
  var idleTimer = null;
  function markActive() {
    $('app').classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { $('app').classList.add('idle'); }, 3500);
  }
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, markActive, { passive: true });
  });
  markActive();

})();
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Server: serves the page, relays signalling + control messages per room.
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  } else if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomId -> Set<ws>

function broadcast(room, obj, except) {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(obj);
  for (const peer of set) {
    if (peer !== except && peer.readyState === 1) peer.send(data);
  }
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2, 10);
  ws.room = null;

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch (e) { return; }

    if (msg.type === 'join') {
      const room = String(msg.room).slice(0, 120);
      let set = rooms.get(room);
      if (!set) { set = new Set(); rooms.set(room, set); }
      if (set.size >= 2 && !set.has(ws)) {
        ws.send(JSON.stringify({ type: 'full' }));
        return;
      }
      ws.room = room;
      ws.name = (msg.name || 'Partner').slice(0, 40);
      const initiator = set.size === 0;     // first in the room drives the call
      let peerName = null;
      for (const peer of set) { peerName = peer.name; } // at most one existing peer
      set.add(ws);
      ws.send(JSON.stringify({ type: 'joined', id: ws.id, initiator: initiator, peers: set.size, peerName: peerName }));
      // tell the existing peer a new person arrived
      broadcast(room, { type: 'peer-joined', name: ws.name }, ws);
      broadcast(room, { type: 'presence', peers: set.size });
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t0: msg.t0, ts: Date.now() }));
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 500).trim();
      if (!text || !ws.room) return;
      broadcast(ws.room, { type: 'chat', text, from: ws.id, fromName: ws.name }, ws);
      return;
    }

    // Everything else (offer/answer/ice/control/sync/reaction) → the other peer.
    if (ws.room) {
      broadcast(ws.room, Object.assign({}, msg, { from: ws.id, fromName: ws.name }), ws);
    }
  });

  ws.on('close', () => {
    const set = ws.room && rooms.get(ws.room);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) { rooms.delete(ws.room); }
    else {
      broadcast(ws.room, { type: 'peer-left' });
      broadcast(ws.room, { type: 'presence', peers: set.size });
    }
  });
});

server.listen(PORT, () => {
  console.log('Watch Together is running.');
  console.log('  Local:   http://localhost:' + PORT);
  console.log('  Open it in two tabs (or share the deployed URL) and join the same room.');
});
