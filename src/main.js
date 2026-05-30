import { TwistyPlayer } from "cubing/twisty";
import { randomScrambleForEvent } from "cubing/scramble";
import { KPuzzle, experimentalCube3x3x3KPuzzle } from "cubing/kpuzzle";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import videos from "./videos.json";

// ─── DOM ─────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const cubeWrapper    = $("cube-wrapper");
const cubeStatus     = $("cube-status");
const btnScramble    = $("btn-scramble");
const btnSolve       = $("btn-solve");
const btnPrev        = $("btn-prev");
const btnNext        = $("btn-next");
const btnPlay        = $("btn-play");
const stepCounter    = $("step-counter");
const solutionPanel  = $("solution-panel");
const scrambleDisp   = $("scramble-display");
const solutionRow    = $("solution-row");
const solutionChips  = $("solution-chips");
const moveCount      = $("move-count");
const nextMoveBox    = $("next-move-box");
const nextMoveNote   = $("next-move-notation");
const nextMoveHint   = $("next-move-hint");
const nextMoveTip    = $("next-move-tip");
const nextFaceSwatch = $("next-face-swatch");
const faceGuide      = $("face-guide");

// ─── State ────────────────────────────────────────────────────────────────────
let player        = null;
let scrambleAlg   = null;
let solutionMoves = [];     // string[] e.g. ["R", "U'", "L2"]
let currentStep   = 0;      // 0 = scrambled, N = fully solved
let moveDuration  = 1000;   // ms per move (read from player after alg is set)
let isAnimating   = false;  // true while a single-step animation is running
let playInterval  = null;   // interval id during auto-play

// ─── Player init ──────────────────────────────────────────────────────────────
function initPlayer() {
  player = new TwistyPlayer({
    puzzle:        "3x3x3",
    visualization: "PG3D",
    hintFacelets:  "floating",
    background:    "none",
    controlPanel:  "none",
    tempoScale:    1.5,       // slightly faster than default
  });
  cubeWrapper.appendChild(player);
}

// ─── Status helper ────────────────────────────────────────────────────────────
function status(msg, type = "idle") {
  cubeStatus.textContent = msg;
  cubeStatus.className   = `status-${type}`;
}

// ─── Face / move description ──────────────────────────────────────────────────
const FACE_META = {
  U: { name: "Top",    color: "#ffffff", border: true,  tip: "looking down at the cube" },
  D: { name: "Bottom", color: "#ffd600", border: false, tip: "looking up at the cube from below" },
  F: { name: "Front",  color: "#00c041", border: false, tip: "the green face facing you" },
  B: { name: "Back",   color: "#0051c7", border: false, tip: "the blue face at the back" },
  R: { name: "Right",  color: "#e8312a", border: false, tip: "the red face on the right side" },
  L: { name: "Left",   color: "#ff7b00", border: false, tip: "the orange face on the left side" },
};
const DIR_TEXT = {
  "":  ["clockwise",         "turn it like a clock when looking at it directly"],
  "'": ["counter-clockwise", "turn it the opposite way to a clock"],
  "2": ["180° half-turn",    "turn it twice (or halfway around)"],
};

function updateNextMove() {
  if (solutionMoves.length === 0) { nextMoveBox.classList.add("hidden"); return; }
  nextMoveBox.classList.remove("hidden");
  nextMoveBox.classList.remove("solved");
  document.querySelectorAll(".face-card").forEach(c => c.classList.remove("active-face"));

  if (currentStep >= solutionMoves.length) {
    nextMoveBox.classList.add("solved");
    nextFaceSwatch.style.cssText = "background:var(--green)";
    nextMoveNote.textContent = "✓";
    nextMoveHint.textContent = "Cube is solved!";
    nextMoveTip.textContent  = "";
  } else {
    const move   = solutionMoves[currentStep];
    const letter = move[0];
    const sfx    = move.includes("'") ? "'" : /\d/.test(move) ? "2" : "";
    const meta   = FACE_META[letter] ?? { name: letter, color: "#888", tip: "" };
    const [dirShort, dirLong] = DIR_TEXT[sfx] ?? DIR_TEXT[""];

    nextFaceSwatch.style.cssText =
      `background:${meta.color};border-color:${meta.border ? "#555" : "rgba(255,255,255,0.15)"}`;
    nextMoveNote.textContent = move;
    nextMoveHint.textContent = `${meta.name} face (${letter}) — ${dirShort}`;
    nextMoveTip.textContent  = currentStep === 0
      ? `Tip: rotate ${meta.tip}, ${dirLong} — then press Next`
      : `Rotate ${meta.tip}, ${dirLong}`;

    const card = document.querySelector(`.face-card[data-face="${letter}"]`);
    if (card) card.classList.add("active-face");
  }
}

// ─── UI sync ──────────────────────────────────────────────────────────────────
function updateStepCounter() {
  if (!solutionMoves.length) { stepCounter.textContent = "—"; return; }
  if (currentStep === 0)                          stepCounter.textContent = `Start (${solutionMoves.length} moves)`;
  else if (currentStep === solutionMoves.length)  stepCounter.textContent = "Solved! ✓";
  else                                            stepCounter.textContent = `Step ${currentStep} / ${solutionMoves.length}`;
}

function renderChips() {
  solutionChips.innerHTML = "";
  solutionMoves.forEach((move, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = move;
    if (i < currentStep)       chip.classList.add("done");
    if (i === currentStep - 1) chip.classList.add("active");
    chip.addEventListener("click", () => jumpToStep(i + 1));
    solutionChips.appendChild(chip);
  });
  const active = solutionChips.querySelector(".active");
  if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function updateNavButtons() {
  const busy = isAnimating || !!playInterval;
  btnPrev.disabled = currentStep === 0 || busy;
  btnNext.disabled = currentStep === solutionMoves.length || busy;
}

function syncUI() {
  updateStepCounter();
  updateNextMove();
  renderChips();
  updateNavButtons();
  if (currentStep === solutionMoves.length) status("Solved!", "done");
}

// ─── Scramble ─────────────────────────────────────────────────────────────────
async function doScramble() {
  stopPlay();
  solutionMoves = [];
  currentStep = 0;
  moveDuration = 1000;

  btnScramble.disabled = true;
  btnSolve.disabled    = true;
  btnPlay.disabled     = true;
  btnPrev.disabled     = true;
  btnNext.disabled     = true;
  stepCounter.textContent = "—";
  solutionRow.classList.add("hidden");
  nextMoveBox.classList.add("hidden");
  faceGuide.classList.add("hidden");

  status("Generating scramble…", "loading");
  try {
    scrambleAlg = await randomScrambleForEvent("333");
    player.experimentalSetupAlg = scrambleAlg;
    player.alg = "";

    scrambleDisp.textContent = scrambleAlg.toString();
    solutionPanel.classList.remove("hidden");
    status("Scrambled — click Solve to find the solution", "ready");
    btnSolve.disabled = false;
  } catch (err) {
    status("Scramble failed. Try again.", "idle");
    console.error(err);
  } finally {
    btnScramble.disabled = false;
  }
}

// ─── Solve ────────────────────────────────────────────────────────────────────
async function doSolve() {
  if (!scrambleAlg) return;
  stopPlay();

  btnSolve.disabled    = true;
  btnScramble.disabled = true;
  btnPrev.disabled     = true;
  btnNext.disabled     = true;
  btnPlay.disabled     = true;

  status("Computing solution…", "solving");
  try {
    const kpuzzle = new KPuzzle(experimentalCube3x3x3KPuzzle);
    kpuzzle.reset();
    kpuzzle.applyAlg(scrambleAlg);
    const solution = await experimentalSolve3x3x3IgnoringCenters(kpuzzle.state);
    solutionMoves = [...solution.units()].map((n) => n.toString());

    // Load the full solution into the player once; control position via timestamp
    player.experimentalSetupAlg = scrambleAlg;
    player.alg = solutionMoves.join(" ");

    // Read how long the full animation is so we can seek per-move
    const timeRange = await player.experimentalModel.timeRangeProp.get();
    moveDuration = solutionMoves.length > 0 ? timeRange.end / solutionMoves.length : 1000;

    // Start at step 0 (scrambled state)
    player.timestamp = "start";
    currentStep = 0;

    moveCount.textContent = `${solutionMoves.length} moves`;
    solutionRow.classList.remove("hidden");
    faceGuide.classList.remove("hidden");
    syncUI();

    status(`Solution found — ${solutionMoves.length} moves. Press Next or Play to begin.`, "ready");
    btnPlay.disabled = false;
  } catch (err) {
    status(`Solving failed: ${err.message}`, "idle");
    console.error("Solve error:", err);
    btnSolve.disabled = false;
  } finally {
    btnScramble.disabled = false;
  }
}

// ─── Step navigation (animated) ───────────────────────────────────────────────
async function stepForward() {
  if (currentStep >= solutionMoves.length || isAnimating || playInterval) return;
  isAnimating = true;
  updateNavButtons();
  try {
    await player.controller.animationController.play({
      untilBoundary: "move",
      autoSkipToOtherEndIfStartingAtBoundary: true,
    });
    currentStep = Math.min(currentStep + 1, solutionMoves.length);
  } finally {
    isAnimating = false;
    syncUI();
  }
}

async function stepBack() {
  if (currentStep <= 0 || isAnimating || playInterval) return;
  isAnimating = true;
  updateNavButtons();
  try {
    await player.controller.animationController.play({
      direction: -1,
      untilBoundary: "move",
      autoSkipToOtherEndIfStartingAtBoundary: true,
    });
    currentStep = Math.max(currentStep - 1, 0);
  } finally {
    isAnimating = false;
    syncUI();
  }
}

// Jump to step N instantly (chip click)
function jumpToStep(n) {
  if (isAnimating) return;
  stopPlay();
  currentStep = Math.max(0, Math.min(n, solutionMoves.length));
  player.timestamp = currentStep * moveDuration;
  player.pause(); // setting timestamp can restart internal playback; re-pause to prevent it
  syncUI();
}

// ─── Play / Pause ─────────────────────────────────────────────────────────────
function stopPlay() {
  if (playInterval) { clearInterval(playInterval); playInterval = null; }
  player.pause();
  btnPlay.classList.remove("pausing");
  btnPlay.innerHTML = "&#9654; Play";
  updateNavButtons();
}

function startPlay() {
  if (solutionMoves.length === 0) return;

  // If already at the end, restart
  if (currentStep >= solutionMoves.length) {
    currentStep = 0;
    player.timestamp = 0;
  }

  player.play();
  btnPlay.classList.add("pausing");
  btnPlay.innerHTML = "&#9646;&#9646; Pause";
  updateNavButtons();

  // Poll the player's timeline position to keep UI in sync
  playInterval = setInterval(async () => {
    const info = await player.experimentalModel.detailedTimelineInfoProp.get();
    const newStep = Math.min(
      solutionMoves.length,
      Math.round(info.timestamp / moveDuration),
    );
    if (newStep !== currentStep) {
      currentStep = newStep;
      updateStepCounter();
      updateNextMove();
      renderChips();
    }
    if (info.atEnd) {
      currentStep = solutionMoves.length;
      stopPlay();
      syncUI();
    }
  }, 80);
}

function togglePlay() {
  if (playInterval) stopPlay(); else startPlay();
}

// ─── Events ───────────────────────────────────────────────────────────────────
btnScramble.addEventListener("click", doScramble);
btnSolve.addEventListener("click", doSolve);
btnPrev.addEventListener("click", stepBack);
btnNext.addEventListener("click", stepForward);
btnPlay.addEventListener("click", togglePlay);

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "BUTTON") return;
  if (e.key === "ArrowRight")     stepForward();
  else if (e.key === "ArrowLeft") stepBack();
  else if (e.key === " ")         { e.preventDefault(); togglePlay(); }
});

// ─── YouTube video cards ──────────────────────────────────────────────────────
function renderVideos() {
  const left  = document.getElementById("video-col-left");
  const right = document.getElementById("video-col-right");
  videos.forEach((v, i) => {
    const col   = i < 2 ? left : right;
    const thumb = `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`;
    const url   = `https://www.youtube.com/watch?v=${v.youtube_id}`;
    const card  = document.createElement("a");
    card.className   = "video-card";
    card.href        = url;
    card.target      = "_blank";
    card.rel         = "noopener noreferrer";
    card.innerHTML   = `
      <img class="video-thumb" src="${thumb}" alt="${v.title}" loading="lazy" />
      <span class="video-title">${v.title}</span>
      <span class="video-btn">&#9654; Watch</span>`;
    col.appendChild(card);
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
renderVideos();
initPlayer();
