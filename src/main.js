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

  // Chip highlighting
  renderChips();
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
