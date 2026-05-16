import { TwistyPlayer } from "cubing/twisty";
import { randomScrambleForEvent } from "cubing/scramble";
import { KPuzzle, experimentalCube3x3x3KPuzzle } from "cubing/kpuzzle";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

// ─── DOM ─────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const cubeWrapper   = $("cube-wrapper");
const cubeStatus    = $("cube-status");
const btnScramble   = $("btn-scramble");
const btnSolve      = $("btn-solve");
const btnPrev       = $("btn-prev");
const btnNext       = $("btn-next");
const btnPlay       = $("btn-play");
const stepCounter   = $("step-counter");
const solutionPanel = $("solution-panel");
const scrambleDisp  = $("scramble-display");
const solutionRow   = $("solution-row");
const solutionChips = $("solution-chips");
const moveCount     = $("move-count");
const nextMoveBox   = $("next-move-box");
const nextMoveNote  = $("next-move-notation");
const nextMoveHint  = $("next-move-hint");
const nextMoveTip   = $("next-move-tip");
const nextFaceSwatch = $("next-face-swatch");
const faceGuide     = $("face-guide");

// ─── State ────────────────────────────────────────────────────────────────────
let player         = null;
let scrambleAlg    = null;   // Alg from cubing/alg
let solutionMoves  = [];     // string[] e.g. ["R","U'","L2"]
let currentStep    = 0;      // 0 = scrambled state, N = fully solved
let playTimer      = null;
const PLAY_MS      = 650;    // ms per move during auto-play

// ─── Player ───────────────────────────────────────────────────────────────────
function initPlayer() {
  player = new TwistyPlayer({
    puzzle:         "3x3x3",
    visualization:  "PG3D",
    hintFacelets:   "floating",
    background:     "none",
    controlPanel:   "none",
  });
  cubeWrapper.appendChild(player);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function status(msg, type = "idle") {
  cubeStatus.textContent = msg;
  cubeStatus.className   = `status-${type}`;
}

function showStep(n) {
  currentStep = Math.max(0, Math.min(n, solutionMoves.length));

  // Build partial alg string from first `currentStep` solution moves
  const partial = solutionMoves.slice(0, currentStep).join(" ");
  player.experimentalSetupAlg = scrambleAlg;
  player.alg = partial;

  // Counter
  if (solutionMoves.length === 0) {
    stepCounter.textContent = "—";
  } else if (currentStep === 0) {
    stepCounter.textContent = `Start (${solutionMoves.length} moves)`;
  } else if (currentStep === solutionMoves.length) {
    stepCounter.textContent = "Solved! ✓";
    status("Solved!", "done");
  } else {
    stepCounter.textContent = `Step ${currentStep} / ${solutionMoves.length}`;
  }

  // Button states
  btnPrev.disabled = currentStep === 0;
  btnNext.disabled = currentStep === solutionMoves.length;

  // Next move box
  updateNextMove();

  // Chip highlighting
  renderChips();
}

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

  // Clear all active-face highlights
  document.querySelectorAll(".face-card").forEach(c => c.classList.remove("active-face"));

  if (currentStep >= solutionMoves.length) {
    nextMoveBox.classList.add("solved");
    nextFaceSwatch.style.background = "var(--green)";
    nextFaceSwatch.style.border = "none";
    nextMoveNote.textContent = "✓";
    nextMoveHint.textContent = "Cube is solved!";
    nextMoveTip.textContent  = "";
  } else {
    const move    = solutionMoves[currentStep];
    const letter  = move[0];
    const suffix  = move.slice(1).replace(/\d+$/, m => m === "1" ? "" : m); // normalise
    const sfx     = move.includes("'") ? "'" : move.match(/\d/) ? "2" : "";
    const meta    = FACE_META[letter] ?? { name: letter, color: "#888", tip: "" };
    const [dirShort, dirLong] = DIR_TEXT[sfx] ?? DIR_TEXT[""];

    // Swatch
    nextFaceSwatch.style.background   = meta.color;
    nextFaceSwatch.style.borderColor  = meta.border ? "#555" : "rgba(255,255,255,0.15)";

    nextMoveNote.textContent = move;
    nextMoveHint.textContent = `${meta.name} face (${letter}) — ${dirShort}`;
    nextMoveTip.textContent  = currentStep === 0
      ? `Tip: rotate ${meta.tip}, ${dirLong} — then press Next`
      : `Rotate ${meta.tip}, ${dirLong}`;

    // Highlight matching face card in the guide
    const card = document.querySelector(`.face-card[data-face="${letter}"]`);
    if (card) card.classList.add("active-face");
  }
}

function showFaceGuide() {
  faceGuide.classList.remove("hidden");
}

function renderChips() {
  solutionChips.innerHTML = "";
  solutionMoves.forEach((move, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = move;
    if (i < currentStep)          chip.classList.add("done");
    if (i === currentStep - 1)    chip.classList.add("active");
    chip.addEventListener("click", () => { stopPlay(); showStep(i + 1); });
    solutionChips.appendChild(chip);
  });
  // Scroll active chip into view
  const active = solutionChips.querySelector(".active");
  if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ─── Scramble ─────────────────────────────────────────────────────────────────
async function doScramble() {
  stopPlay();
  btnScramble.disabled = true;
  btnSolve.disabled    = true;
  btnPlay.disabled     = true;
  btnPrev.disabled     = true;
  btnNext.disabled     = true;
  solutionMoves = [];
  currentStep   = 0;
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
  btnSolve.disabled   = true;
  btnScramble.disabled = true;
  btnPrev.disabled    = true;
  btnNext.disabled    = true;
  btnPlay.disabled    = true;

  status("Computing solution…", "solving");
  try {
    const kpuzzle = new KPuzzle(experimentalCube3x3x3KPuzzle);
    kpuzzle.reset();
    kpuzzle.applyAlg(scrambleAlg);

    const solution = await experimentalSolve3x3x3IgnoringCenters(kpuzzle.state);
    solutionMoves  = [...solution.units()].map((n) => n.toString());

    moveCount.textContent = `${solutionMoves.length} moves`;
    solutionRow.classList.remove("hidden");

    showFaceGuide();
    showStep(0);   // reset to scrambled start
    status(`Solution found — ${solutionMoves.length} moves. Use arrows or Play to step through.`, "ready");
    btnPlay.disabled = false;
  } catch (err) {
    status(`Solving failed: ${err.message}`, "idle");
    console.error("Solve error:", err);
    btnSolve.disabled = false;
  } finally {
    btnScramble.disabled = false;
  }
}

// ─── Play / Pause ─────────────────────────────────────────────────────────────
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  btnPlay.classList.remove("pausing");
  btnPlay.innerHTML = "&#9654; Play";
}

function startPlay() {
  if (solutionMoves.length === 0) return;
  if (currentStep >= solutionMoves.length) showStep(0);  // restart

  btnPlay.classList.add("pausing");
  btnPlay.innerHTML = "&#9646;&#9646; Pause";

  playTimer = setInterval(() => {
    if (currentStep >= solutionMoves.length) { stopPlay(); return; }
    showStep(currentStep + 1);
  }, PLAY_MS);
}

function togglePlay() {
  if (playTimer) stopPlay(); else startPlay();
}

// ─── Events ───────────────────────────────────────────────────────────────────
btnScramble.addEventListener("click", doScramble);
btnSolve.addEventListener("click", doSolve);
btnPrev.addEventListener("click", () => { stopPlay(); showStep(currentStep - 1); });
btnNext.addEventListener("click", () => { stopPlay(); showStep(currentStep + 1); });
btnPlay.addEventListener("click", togglePlay);

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "BUTTON") return;
  if (e.key === "ArrowRight")      { stopPlay(); showStep(currentStep + 1); }
  else if (e.key === "ArrowLeft")  { stopPlay(); showStep(currentStep - 1); }
  else if (e.key === " ")          { e.preventDefault(); togglePlay(); }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
initPlayer();
