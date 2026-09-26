"use strict";

/* ============================================================
   ORDEN ARÁBIGO
   ------------------------------------------------------------
   • 40 fichas (1–40) en 5 columnas × 8 filas.
   • Toca una ficha para seleccionarla, toca otra para
     intercambiarlas. Acomoda las fichas del 1 al 40.
   • Las fichas ya en su lugar se marcan en verde.
   ============================================================ */

const TOTAL = 40;
const COLS = 5;
const ROWS = TOTAL / COLS;

/* ---------- Estado ---------- */
let order = [];        // order[i] = número en la casilla i
let selected = null;   // índice seleccionado, o null
let placedCount = 0;   // cuántos números ya van acomodados (0..40)
let seriesJustAdvanced = false; // ¿acaba de acomodarse la que sigue?
let moves = 0;
let won = false;
let justShuffled = false; // evita marcar en verde al revolver
let startTime = 0;     // inicio de la partida (ms)
let finalTime = 0;     // tiempo final al ganar (ms)
let timerId = null;    // id del intervalo del cronómetro

/* ---------- DOM ---------- */
const boardEl = document.getElementById("board");
const movesLabel = document.getElementById("movesLabel");
const progressBar = document.getElementById("progressBar");
const timerLabel = document.getElementById("timerLabel");
const overlayEl = document.getElementById("overlay");
const modalStatsEl = document.getElementById("modalStats");
const modalTimeEl = document.getElementById("modalTime");
const modalMovesEl = document.getElementById("modalMoves");
const btnReset = document.getElementById("btnReset");
const btnPlayAgain = document.getElementById("btnPlayAgain");
const btnClose = document.getElementById("btnClose");

/* ---------- Utilidades ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function pad(n) {
  return String(n).padStart(4, "0");
}

/* 00:00 → mm:ss  (o h:mm:ss si dura más de una hora) */
function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}

/* Mensaje hermoso según el tiempo y movimientos */
function victoryMessage(ms, mv) {
  const sec = Math.floor(ms / 1000);
  const time = fmtTime(ms);
  const movs = mv + (mv === 1 ? " movimiento" : " movimientos");
  if (sec < 45) return "⚡ ¡Velocísimo! Lo armaste en " + time + " con " + movs + ".";
  if (sec < 90) return "🚀 ¡Muy rápido! " + time + " y " + movs + " — casi récord.";
  if (sec < 180) return "🔥 ¡Excelente ritmo! " + time + " con " + movs + ".";
  if (sec < 360) return "✨ ¡Muy bien! " + time + " y " + movs + ", gran puntería.";
  if (sec < 600) return "🌙 ¡Lo lograste! " + time + " con " + movs + ".";
  return "🧘 ¡Terminaste! " + time + " y " + movs + " — la paciencia venció al caos.";
}

/* ---------- Cronómetro ---------- */
function startTimer() {
  stopTimer();
  startTime = Date.now();
  finalTime = 0;
  timerLabel.textContent = "TIME 00:00";
  timerId = setInterval(() => {
    timerLabel.textContent = "TIME " + fmtTime(Date.now() - startTime);
  }, 500);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/* ---------- Construir fichas ---------- */
function buildCells() {
  boardEl.innerHTML = "";
  for (let i = 0; i < TOTAL; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.addEventListener("click", onCellClick);
    boardEl.appendChild(cell);
  }
}

/* ---------- Render ---------- */
function render() {
  const cells = boardEl.children;
  let correct = 0;
  const nextVal = placedCount + 1;

  for (let i = 0; i < TOTAL; i++) {
    const cell = cells[i];
    const value = order[i];
    cell.textContent = String(value);

    // Verde SOLO cuando el jugador acaba de poner la que sigue
    // y la serie avanzó. Al iniciar el juego NINGUNA casilla
    // nace encendida, aunque el número coincida con su lugar.
    const inSeries = i < placedCount;
    const isCorrect =
      inSeries && value === i + 1 && seriesJustAdvanced;
    if (isCorrect) correct++;

    cell.classList.toggle("is-correct", isCorrect && i !== selected);
    cell.classList.toggle("is-selected", i === selected);

    // Destino: solo se enciende el foco de POSICIÓN cuando el
    // jugador selecciona una ficha. Al iniciar el juego NINGUNA
    // casilla está encendida: solo se ven los números tal cual.
    const isDest =
      !won && !justShuffled && i === placedCount && selected !== null;
    cell.classList.toggle("is-hint", isDest);

    // La casilla ya acomodada no se puede tocar
    cell.classList.toggle("is-locked", inSeries);
  }

  // El verde se apaga en cuanto se toca cualquier ficha (se
  // reencenderá solo si acaba de acomodarse la que sigue).
  if (selected !== null) seriesJustAdvanced = false;

  movesLabel.textContent = won
    ? "COMPLETE  •  " + pad(moves) + " MOVES"
    : "MOVES " + pad(moves) + "  •  NEXT " + Math.min(nextVal, TOTAL);
  movesLabel.classList.toggle("win", won);

  progressBar.style.width = ((correct / TOTAL) * 100).toFixed(1) + "%";
  boardEl.classList.toggle("complete", won);
}

/* Aviso emergente */
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1600);
}

/* ---------- Selección e intercambio ---------- */
function onCellClick(e) {
  if (won || justShuffled) return; // bloqueado durante la animación

  const index = Number(e.currentTarget.dataset.index);

  // Casillas ya acomodadas: bloqueadas (sin trampas)
  if (index < placedCount) {
    vibrate([20, 40, 20]);
    toast("🔒 Esa casilla ya está acomodada");
    return;
  }

  // Primera selección (cualquier ficha pendiente, aunque no sea
  // la que sigue: puedes encender el foco, pero no acomodarla aún)
  if (selected === null) {
    selected = index;
    vibrate(10);
    render();
    return;
  }

  // Tocó la misma: se deselecciona
  if (index === selected) {
    selected = null;
    render();
    return;
  }

  // REGLA DE ORO: solo se puede colocar en la casilla que sigue
  // en la serie (la de "mero arriba"). Nada de trampas.
  if (index !== placedCount) {
    showBlocked(index);
    return;
  }

  // Intercambio
  [order[selected], order[index]] = [order[index], order[selected]];
  selected = null;
  moves++;
  vibrate(18);

  // Si ahí cayó la que sigue, avanza la serie 1,2,3…
  // Solo entonces se enciende el verde de las casillas acomodadas.
  if (order[index] === placedCount + 1) {
    advanceSeries();
    seriesJustAdvanced = true;
  }

  render();
  checkWin();
}

/* Aviso cuando intentan acomodar fuera de turno */
function showBlocked(index) {
  const cell = boardEl.children[index];
  cell.classList.remove("is-blocked");
  void cell.offsetWidth; // reinicia la animación
  cell.classList.add("is-blocked");
  vibrate([30, 50, 30]);

  const nextVal = Math.min(placedCount + 1, TOTAL);
  toast("🔒 Solo va el " + nextVal + " en la casilla marcada");

  setTimeout(() => cell.classList.remove("is-blocked"), 600);
}

/* Acomoda la casilla siguiente y todas las que ya coincidan en serie */
function advanceSeries() {
  while (
    placedCount < TOTAL &&
    order[placedCount] === placedCount + 1
  ) {
    placedCount++;
  }
}

/* ---------- Victoria ---------- */
function checkWin() {
  if (placedCount < TOTAL) return;
  won = true;
  selected = null;
  finalTime = Date.now() - startTime;
  stopTimer();
  timerLabel.textContent = "TIME " + fmtTime(finalTime);
  render();
  vibrate([80, 60, 80, 60, 150]);

  modalStatsEl.textContent = victoryMessage(finalTime, moves);
  modalTimeEl.textContent = fmtTime(finalTime);
  modalMovesEl.textContent = String(moves);

  setTimeout(() => {
    overlayEl.hidden = false;
  }, 550);
}

/* ---------- Revolver ---------- */

// Genera una barajada que SIEMPRE sea un juego nuevo:
//  • nunca sale resuelta,
//  • nunca repite la barajada anterior,
//  • y las primeras filas están bien revueltas (no casi resueltas).
function generateFreshBoard(prev) {
  let best = null;
  let bestScore = -1;

  for (let attempt = 0; attempt < 60; attempt++) {
    const nums = shuffle(Array.from({ length: TOTAL }, (_, i) => i + 1));

    // 1) Nunca empezar ya resuelto
    if (nums.every((v, i) => v === i + 1)) continue;

    // 2) Nunca repetir exactamente la barajada anterior
    if (prev && nums.every((v, i) => v === prev[i])) continue;

    // Puntaje: cuántas de las PRIMERAS casillas NO están en su lugar
    // (para que el juego arranque bien revuelto, sin verdes arriba).
    let score = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (nums[i] !== i + 1) score++;
      else score--; // penaliza casillas verdes
    }

    if (score > bestScore) {
      bestScore = score;
      best = nums;
    }

    // Barajada perfecta: ninguna casilla en su lugar → no busca más
    if (score === TOTAL) return nums;
  }

  return best;
}

function shuffleGame() {
  order = generateFreshBoard(order);
  selected = null;
  placedCount = 0;
  moves = 0;
  won = false;
  seriesJustAdvanced = false; // nada empieza encendido
  overlayEl.hidden = true;

  // Mientras dure la animación NINGUNA casilla se pinta en verde,
  // ni siquiera si alguna coincidiera con su número.
  justShuffled = true;

  stopTimer();
  timerLabel.textContent = "TIME 00:00";

  boardEl.classList.remove("complete");
  boardEl.classList.add("is-shuffling");
  render();

  const cells = boardEl.children;
  for (let i = 0; i < cells.length; i++) {
    cells[i].style.animationDelay =
      (i % COLS) * 18 + Math.floor(i / COLS) * 24 + "ms";
  }

  // El cronómetro empieza al terminar la animación de barajado,
  // para que no cuente los 0.7 s del revoleo.
  setTimeout(() => {
    boardEl.classList.remove("is-shuffling");
    for (let i = 0; i < cells.length; i++) cells[i].style.animationDelay = "";
    justShuffled = false;
    startTimer(); // ← aquí empieza a correr el tiempo
    render(); // a partir de aquí sí se marcan las que estén en su lugar
  }, 700);
}

/* ---------- Eventos ---------- */
btnReset.addEventListener("click", shuffleGame);
btnPlayAgain.addEventListener("click", shuffleGame);
btnClose.addEventListener("click", () => {
  overlayEl.hidden = true;
});

/* ---------- Init ---------- */
buildCells();
shuffleGame();
