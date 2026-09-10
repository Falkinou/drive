import { useEffect, useMemo, useRef, useState } from "react";

const SIZE = 8;
const GREEN = "#45e6a8";
const GREEN_DARK = "#08795b";
const PURPLE = "#b59aff";
const PURPLE_DARK = "#6949c6";
const OBSTACLES = [[3, 3], [3, 4], [4, 3], [4, 4]];
const EMPTY_REACH = { duplicate: [], jump: [] };

function initialBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const [row, column] of OBSTACLES) board[row][column] = -1;
  board[0][0] = 1;
  board[SIZE - 1][SIZE - 1] = 2;
  return board;
}

function parseBoard(value) {
  if (Array.isArray(value)) return value.map(row => [...row]);
  try { return JSON.parse(value); } catch { return initialBoard(); }
}

function reachable(board, row, column) {
  const result = { duplicate: [], jump: [] };
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (targetRow < 0 || targetRow >= SIZE || targetColumn < 0 || targetColumn >= SIZE) continue;
      if (board[targetRow][targetColumn] !== 0) continue;
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
      result[distance === 1 ? "duplicate" : "jump"].push([targetRow, targetColumn]);
    }
  }
  return result;
}

function allMoves(board, player) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (board[row][column] !== player) continue;
      const targets = reachable(board, row, column);
      for (const to of [...targets.duplicate, ...targets.jump]) moves.push({ from: [row, column], to });
    }
  }
  return moves;
}

function applyMove(board, player, from, to) {
  const [fromRow, fromColumn] = from;
  const [toRow, toColumn] = to;
  const distance = Math.max(Math.abs(toRow - fromRow), Math.abs(toColumn - fromColumn));
  const mode = distance === 1 ? "duplicate" : "jump";
  const next = board.map(row => [...row]);
  if (mode === "jump") next[fromRow][fromColumn] = 0;
  next[toRow][toColumn] = player;
  const opponent = player === 1 ? 2 : 1;
  const converted = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const row = toRow + rowOffset;
      const column = toColumn + columnOffset;
      if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) continue;
      if (next[row][column] === opponent) {
        next[row][column] = player;
        converted.push([row, column]);
      }
    }
  }
  return { board: next, mode, converted };
}

function countsFor(board) {
  const result = { green: 0, purple: 0, empty: 0 };
  for (const row of board) for (const cell of row) {
    if (cell === 1) result.green += 1;
    if (cell === 2) result.purple += 1;
    if (cell === 0) result.empty += 1;
  }
  return result;
}

function resolveTurn(board, player) {
  const opponent = player === 1 ? 2 : 1;
  const counts = countsFor(board);
  const playerCanMove = allMoves(board, player).length > 0;
  const opponentCanMove = allMoves(board, opponent).length > 0;
  const ended = counts.empty === 0 || (!playerCanMove && !opponentCanMove);
  return {
    ended,
    winner: ended ? (counts.green === counts.purple ? null : counts.green > counts.purple ? 1 : 2) : null,
    nextTurn: opponentCanMove ? opponent : player,
    passed: !ended && !opponentCanMove,
    counts,
  };
}

function cellKey([row, column]) { return `${row}:${column}`; }

function evaluateBoard(board, player) {
  const opponent = player === 1 ? 2 : 1;
  const counts = countsFor(board);
  const material = player === 1 ? counts.green - counts.purple : counts.purple - counts.green;
  const mobility = allMoves(board, player).length - allMoves(board, opponent).length;
  const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
  let cornerScore = 0;
  for (const [row, column] of corners) {
    if (board[row][column] === player) cornerScore += 1;
    if (board[row][column] === opponent) cornerScore -= 1;
  }
  return material * 5 + mobility * .35 + cornerScore * 8;
}

function scoreMove(board, player, move) {
  const result = applyMove(board, player, move.from, move.to);
  const corner = (move.to[0] === 0 || move.to[0] === 7) && (move.to[1] === 0 || move.to[1] === 7);
  return evaluateBoard(result.board, player) + result.converted.length * 7 + (result.mode === "duplicate" ? 3 : 0) + (corner ? 12 : 0);
}

function minimax(board, rootPlayer, currentPlayer, depth, alpha, beta) {
  const moves = allMoves(board, currentPlayer);
  if (depth === 0 || moves.length === 0) return evaluateBoard(board, rootPlayer);
  const maximizing = currentPlayer === rootPlayer;
  const ordered = moves
    .map(move => ({ move, score: scoreMove(board, currentPlayer, move) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 28);
  let best = maximizing ? -Infinity : Infinity;
  for (const candidate of ordered) {
    const next = applyMove(board, currentPlayer, candidate.move.from, candidate.move.to).board;
    const value = minimax(next, rootPlayer, currentPlayer === 1 ? 2 : 1, depth - 1, alpha, beta);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, value); else beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return best;
}

function pickAiMove(board, level) {
  const moves = allMoves(board, 2);
  if (!moves.length) return null;
  if (level === "easy" && Math.random() < .7) return moves[Math.floor(Math.random() * moves.length)];
  const ranked = moves.map(move => ({ move, score: scoreMove(board, 2, move) })).sort((a, b) => b.score - a.score);
  if (level === "medium") return ranked[Math.floor(Math.random() * Math.min(4, ranked.length))].move;
  let best = { move: ranked[0].move, score: -Infinity };
  for (const candidate of ranked.slice(0, 24)) {
    const next = applyMove(board, 2, candidate.move.from, candidate.move.to).board;
    const score = minimax(next, 2, 1, 2, -Infinity, Infinity);
    if (score > best.score) best = { move: candidate.move, score };
  }
  return best.move;
}

let audioContext;
function tone(frequency, duration, type = "sine", volume = .06) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch {}
}

function sound(name, enabled) {
  if (!enabled) return;
  if (name === "select") tone(560, .08, "sine");
  if (name === "move") { tone(380, .08); setTimeout(() => tone(620, .1), 55); }
  if (name === "convert") tone(820, .11, "triangle", .08);
  if (name === "win") { tone(520, .14); setTimeout(() => tone(660, .14), 120); setTimeout(() => tone(820, .24), 240); }
  if (name === "lose") { tone(300, .18, "triangle"); setTimeout(() => tone(190, .3, "triangle"), 150); }
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

async function bacteriaApi(path, options = {}) {
  const response = await fetch(`/api/bacteria${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Erreur de connexion");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function readStats() {
  try { return { games: 0, wins: 0, streak: 0, best: 0, ...JSON.parse(localStorage.getItem("drive_bacteria_stats") || "{}") }; }
  catch { return { games: 0, wins: 0, streak: 0, best: 0 }; }
}

function recordResult(won, margin) {
  const stats = readStats();
  stats.games += 1;
  stats.wins += won ? 1 : 0;
  stats.streak = won ? stats.streak + 1 : 0;
  stats.best = won ? Math.max(stats.best, margin) : stats.best;
  try { localStorage.setItem("drive_bacteria_stats", JSON.stringify(stats)); } catch {}
  return stats;
}

const STYLE = `
.bact{--green:${GREEN};--purple:${PURPLE};min-height:100dvh;background:radial-gradient(circle at 10% 0%,rgba(27,138,107,.28),transparent 34%),radial-gradient(circle at 95% 85%,rgba(157,134,255,.24),transparent 38%),#070b18;color:#fff;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden;position:relative}
.bact *,.bact-arena *{box-sizing:border-box}.bact button,.bact input,.bact-arena button{font:inherit}.bact button,.bact-arena button{-webkit-tap-highlight-color:transparent}.bact-shell{width:min(100%,460px);min-height:100dvh;margin:auto;position:relative;z-index:1;padding:max(14px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom))}
.bact-nav{height:44px;display:flex;align-items:center;justify-content:space-between}.bact-icon-btn{width:40px;height:40px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:rgba(255,255,255,.065);color:#fff;display:grid;place-items:center;cursor:pointer;font-size:18px;backdrop-filter:blur(16px)}
.bact-brand{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase}.bact-live{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
.bact-hero{text-align:center;padding:22px 0 18px}.bact-orb{width:104px;height:104px;margin:0 auto 14px;display:grid;place-items:center;position:relative}.bact-orb:before{content:'';position:absolute;inset:4px;border-radius:32px;background:linear-gradient(145deg,rgba(69,230,168,.24),rgba(181,154,255,.22));border:1px solid rgba(255,255,255,.12);transform:rotate(10deg);box-shadow:0 24px 60px rgba(0,0,0,.35),0 0 45px rgba(181,154,255,.18)}
.bact-orb-grid{position:relative;width:72px;height:72px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.bact-orb-grid i{border-radius:7px;background:rgba(255,255,255,.07)}.bact-orb-grid i:nth-child(1),.bact-orb-grid i:nth-child(6),.bact-orb-grid i:nth-child(11){background:linear-gradient(145deg,var(--green),${GREEN_DARK});box-shadow:0 0 12px rgba(69,230,168,.4)}.bact-orb-grid i:nth-child(4),.bact-orb-grid i:nth-child(10),.bact-orb-grid i:nth-child(16){background:linear-gradient(145deg,var(--purple),${PURPLE_DARK});box-shadow:0 0 12px rgba(181,154,255,.4)}
.bact-title{font-size:40px;line-height:.98;letter-spacing:-2px;font-weight:950;margin:0;background:linear-gradient(115deg,#fff 20%,#bfffe7 48%,#d6cbff 82%);background-clip:text;-webkit-background-clip:text;color:transparent}.bact-subtitle{color:rgba(255,255,255,.5);font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-top:9px}
.bact-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 18px}.bact-stat{padding:11px 8px;border:1px solid rgba(255,255,255,.075);background:rgba(255,255,255,.035);border-radius:14px;text-align:center}.bact-stat strong{font-size:18px;display:block}.bact-stat span{display:block;color:rgba(255,255,255,.42);font-size:8px;font-weight:900;letter-spacing:1px;text-transform:uppercase;margin-top:2px}
.bact-section-label{font-size:9px;color:rgba(255,255,255,.42);font-weight:900;letter-spacing:1.6px;text-transform:uppercase;margin:16px 2px 8px}.bact-levels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.bact-level{min-height:100px;padding:13px 9px;border-radius:16px;text-align:left;color:#fff;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.025));transition:.2s transform,.2s border-color}.bact-level:active{transform:scale(.97)}.bact-level b{font-size:13px;display:block;margin:8px 0 4px}.bact-level small{font-size:9px;line-height:1.35;color:rgba(255,255,255,.48);display:block}.bact-level-icon{font-size:20px}.bact-level:nth-child(1){border-color:rgba(69,230,168,.25)}.bact-level:nth-child(2){border-color:rgba(255,184,77,.27)}.bact-level:nth-child(3){border-color:rgba(181,154,255,.3)}
.bact-online{display:grid;grid-template-columns:1.35fr 1fr;gap:8px}.bact-primary,.bact-secondary{height:52px;border-radius:15px;color:#fff;font-size:12px;font-weight:900;cursor:pointer}.bact-primary{border:0;background:linear-gradient(115deg,${GREEN_DARK},#2bcf9a);box-shadow:0 10px 28px rgba(27,138,107,.25)}.bact-secondary{border:1px solid rgba(181,154,255,.35);background:rgba(181,154,255,.1)}.bact-primary:disabled,.bact-secondary:disabled{opacity:.45;cursor:wait}.bact-help{margin:16px auto 0;border:0;background:transparent;color:rgba(255,255,255,.52);font-size:10px;font-weight:800;display:block;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.bact-panel{margin-top:22px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);border-radius:22px;padding:18px;backdrop-filter:blur(18px)}.bact-panel h2{font-size:25px;letter-spacing:-.8px;margin:0 0 5px}.bact-panel>p{font-size:11px;color:rgba(255,255,255,.48);margin:0 0 20px}.bact-code{width:100%;height:70px;border-radius:17px;border:1px solid rgba(181,154,255,.35);background:rgba(255,255,255,.045);outline:none;color:#fff;text-align:center;text-transform:uppercase;font-size:30px;font-weight:950;letter-spacing:12px;padding-left:12px;margin-bottom:10px}.bact-code:focus{border-color:var(--purple);box-shadow:0 0 0 3px rgba(181,154,255,.12)}
.bact-wait{text-align:center;padding-top:50px}.bact-room-label{font-size:9px;letter-spacing:2px;font-weight:900;color:rgba(255,255,255,.42);text-transform:uppercase}.bact-room-code{font:950 58px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:10px;color:var(--purple);text-shadow:0 0 26px rgba(181,154,255,.5);margin:12px 0 30px}.bact-player-row{display:flex;align-items:center;gap:12px;padding:13px;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);margin-bottom:8px;text-align:left}.bact-player-dot{width:38px;height:38px;border-radius:14px;display:grid;place-items:center;font-weight:950}.bact-player-row strong{font-size:13px}.bact-player-row small{display:block;color:rgba(255,255,255,.4);font-size:9px;margin-top:2px}.bact-spinner{width:24px;height:24px;border-radius:50%;border:3px solid rgba(255,255,255,.1);border-top-color:var(--purple);animation:bact-spin .8s linear infinite;margin:26px auto 9px}
.bact-rules{position:fixed;inset:0;z-index:80;background:rgba(3,5,12,.78);backdrop-filter:blur(16px);display:grid;align-items:end;padding:14px}.bact-rules-card{width:min(100%,430px);margin:auto;background:#111629;border:1px solid rgba(255,255,255,.1);border-radius:26px;padding:20px}.bact-rules-head{display:flex;justify-content:space-between;align-items:center}.bact-rules h2{font-size:23px;margin:0}.bact-rule{display:flex;gap:13px;align-items:flex-start;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07)}.bact-rule:last-of-type{border:0}.bact-rule-num{width:30px;height:30px;flex:0 0 30px;border-radius:10px;background:linear-gradient(145deg,rgba(69,230,168,.2),rgba(181,154,255,.2));display:grid;place-items:center;font-size:11px;font-weight:950}.bact-rule b{font-size:12px;display:block}.bact-rule p{font-size:10px;line-height:1.45;color:rgba(255,255,255,.5);margin:3px 0 0}
.bact-arena{--green:${GREEN};--purple:${PURPLE};position:fixed;inset:0;z-index:999;background:radial-gradient(circle at 15% 5%,rgba(27,138,107,.25),transparent 28%),radial-gradient(circle at 90% 92%,rgba(105,73,198,.27),transparent 34%),#070b18;color:#fff;font-family:'DM Sans',-apple-system,sans-serif;overflow:auto;overscroll-behavior:none;user-select:none;-webkit-user-select:none}.bact-arena-shell{width:min(100%,560px);min-height:100dvh;margin:auto;padding:max(10px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column}
.bact-arena-nav{height:42px;display:flex;align-items:center;gap:10px}.bact-arena-name{font-size:12px;font-weight:950;letter-spacing:1.2px;text-transform:uppercase;flex:1}.bact-move-number{font-size:9px;color:rgba(255,255,255,.4);font-weight:800}.bact-score-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.bact-score{height:62px;border-radius:17px;padding:8px 11px;display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);transition:.25s}.bact-score.active.green{border-color:rgba(69,230,168,.7);box-shadow:inset 0 0 24px rgba(69,230,168,.1),0 0 20px rgba(69,230,168,.08)}.bact-score.active.purple{border-color:rgba(181,154,255,.7);box-shadow:inset 0 0 24px rgba(181,154,255,.1),0 0 20px rgba(181,154,255,.08)}.bact-score-blob{width:35px;height:35px;border-radius:46% 54% 49% 51%/58% 52% 48% 42%;position:relative;flex:0 0 auto}.bact-score-blob:after{content:'';position:absolute;width:9px;height:4px;left:7px;top:6px;border-radius:50%;background:rgba(255,255,255,.5)}.bact-score-name{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.63);font-weight:800}.bact-score-value{font-size:20px;line-height:1;font-weight:950;margin-top:3px}.bact-you{font-size:7px;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.1);margin-left:3px}.bact-territory{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;display:flex;margin:0 2px 9px}.bact-territory-green{background:linear-gradient(90deg,${GREEN_DARK},var(--green));transition:width .4s}.bact-territory-purple{background:linear-gradient(90deg,var(--purple),${PURPLE_DARK});transition:width .4s}
.bact-status{text-align:center;height:30px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:10px;font-weight:950;letter-spacing:1.1px;text-transform:uppercase}.bact-status-dot{width:7px;height:7px;border-radius:50%;animation:bact-pulse 1.35s ease-in-out infinite}.bact-board-wrap{display:flex;align-items:flex-start;justify-content:center;min-height:0;padding-top:9px}.bact-board{width:min(100%,520px);aspect-ratio:1;border-radius:25px;padding:9px;background:linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.11);box-shadow:0 24px 70px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08);display:grid;grid-template-columns:repeat(8,1fr);gap:4px;position:relative}.bact-cell{position:relative;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.025);border-radius:11px;padding:0;min-width:0;cursor:default;display:grid;place-items:center;overflow:visible}.bact-cell.playable{cursor:pointer}.bact-cell.duplicate{background:rgba(69,230,168,.11);border-color:currentColor;box-shadow:inset 0 0 16px rgba(69,230,168,.11)}.bact-cell.jump{border-style:dashed;border-color:currentColor;background:rgba(255,255,255,.035)}.bact-cell.selected{z-index:2;box-shadow:0 0 0 2px #ffe082,0 0 22px rgba(255,224,130,.38)}.bact-cell.last:after{content:'';position:absolute;inset:3px;border-radius:8px;border:1px solid rgba(255,255,255,.36);pointer-events:none}.bact-cell.converted{animation:bact-convert .55s cubic-bezier(.2,.8,.2,1)}.bact-target{font-size:15px;font-weight:950;opacity:.8}.bact-target.jump{font-size:17px}.bact-rock{position:absolute;inset:14%;border-radius:42% 56% 40% 60%;background:radial-gradient(circle at 35% 25%,#384158,#171d2c 65%,#080b13);box-shadow:inset 0 1px 4px rgba(255,255,255,.16),0 6px 9px rgba(0,0,0,.45);transform:rotate(-8deg)}
.bact-blob{width:68%;height:68%;border-radius:46% 54% 49% 51%/58% 52% 48% 42%;position:relative;filter:drop-shadow(0 5px 4px rgba(0,0,0,.3));animation:bact-breathe 2.6s ease-in-out infinite}.bact-blob.green{background:radial-gradient(circle at 34% 22%,#c4ffe8 0 7%,var(--green) 22%,${GREEN_DARK} 82%)}.bact-blob.purple{background:radial-gradient(circle at 34% 22%,#f2edff 0 7%,var(--purple) 22%,${PURPLE_DARK} 82%)}.bact-eyes{position:absolute;left:24%;right:24%;top:37%;height:16%;display:flex;justify-content:space-between}.bact-eye{width:25%;aspect-ratio:1;background:#fff;border-radius:50%;position:relative}.bact-eye:after{content:'';position:absolute;width:50%;height:50%;right:4%;bottom:3%;border-radius:50%;background:#101321}.bact-mouth{position:absolute;left:37%;width:26%;height:13%;top:62%;border-bottom:2px solid rgba(5,10,20,.7);border-radius:50%}.bact-selected-ring{position:absolute;inset:-10%;border:2px solid #ffe082;border-radius:50%;animation:bact-ring 1.2s linear infinite}.bact-bottom{height:46px;display:flex;align-items:center;justify-content:center;text-align:center;color:rgba(255,255,255,.45);font-size:9px;line-height:1.35;padding:5px 18px}.bact-bottom strong{color:rgba(255,255,255,.75)}
.bact-end{position:fixed;inset:0;z-index:60;background:rgba(3,5,12,.79);backdrop-filter:blur(15px);display:grid;place-items:center;padding:18px}.bact-end-card{width:min(100%,390px);border-radius:28px;padding:24px;background:linear-gradient(155deg,#171d31,#0d1120);border:1px solid rgba(255,255,255,.12);box-shadow:0 28px 90px rgba(0,0,0,.55);text-align:center}.bact-trophy{font-size:54px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}.bact-end h2{font-size:30px;letter-spacing:-1px;margin:7px 0 3px}.bact-end p{font-size:11px;color:rgba(255,255,255,.5);margin:0 0 18px}.bact-final-score{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:15px 0 22px}.bact-final-score strong{font-size:34px}.bact-final-score span{font-size:10px;color:rgba(255,255,255,.35);font-weight:900}.bact-end-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:8px}
.bact-toast{position:fixed;left:50%;top:max(18px,env(safe-area-inset-top));transform:translateX(-50%);z-index:90;background:#fff;color:#101321;border-radius:13px;padding:10px 14px;font-size:10px;font-weight:900;box-shadow:0 12px 40px rgba(0,0,0,.35);white-space:nowrap;animation:bact-toast .25s ease-out}
@keyframes bact-spin{to{transform:rotate(360deg)}}@keyframes bact-pulse{50%{opacity:.32;transform:scale(.72)}}@keyframes bact-breathe{50%{transform:scale(1.035) rotate(1deg)}}@keyframes bact-ring{50%{transform:scale(1.05);opacity:.45}}@keyframes bact-convert{0%{transform:scale(.6) rotate(-15deg)}55%{transform:scale(1.22) rotate(7deg)}100%{transform:scale(1) rotate(0)}}@keyframes bact-toast{from{opacity:0;transform:translate(-50%,-8px)}}
@media(max-height:720px){.bact-hero{padding:8px 0}.bact-orb{width:76px;height:76px;margin-bottom:8px}.bact-orb-grid{width:54px;height:54px}.bact-title{font-size:32px}.bact-stats{margin-bottom:8px}.bact-level{min-height:82px;padding:9px 8px}.bact-level-icon{font-size:16px}.bact-section-label{margin-top:10px}.bact-arena-nav{height:34px}.bact-score{height:52px}.bact-score-row{margin:4px 0}.bact-bottom{height:32px}.bact-board{width:min(88vh,100%,500px)}}
@media(min-width:700px){.bact-rules{align-items:center}.bact-board{gap:6px;padding:12px}.bact-cell{border-radius:14px}}
@media(prefers-reduced-motion:reduce){.bact *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

function BackButton({ onClick, label = "Retour" }) {
  return <button className="bact-icon-btn" onClick={onClick} aria-label={label}>‹</button>;
}

function Rules({ onClose }) {
  return <div className="bact-rules" onClick={onClose}>
    <div className="bact-rules-card" onClick={event => event.stopPropagation()}>
      <div className="bact-rules-head"><h2>Comment jouer</h2><button className="bact-icon-btn" onClick={onClose}>×</button></div>
      <div className="bact-rule"><div className="bact-rule-num">01</div><div><b>Choisis une de tes bactéries</b><p>Les cases disponibles apparaissent immédiatement autour d’elle.</p></div></div>
      <div className="bact-rule"><div className="bact-rule-num">02</div><div><b>Duplique ou saute</b><p>À 1 case, la bactérie se duplique. À 2 cases, elle saute et quitte sa case d’origine.</p></div></div>
      <div className="bact-rule"><div className="bact-rule-num">03</div><div><b>Contamine le territoire</b><p>Toutes les bactéries adverses adjacentes à l’arrivée changent de couleur. La majorité gagne.</p></div></div>
      <button className="bact-primary" style={{ width: "100%", marginTop: 10 }} onClick={onClose}>J’ai compris</button>
    </div>
  </div>;
}

export default function Bacteria({ setPage, auth, flash }) {
  const [screen, setScreen] = useState("lobby");
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("solo");
  const [difficulty, setDifficulty] = useState("medium");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [stats, setStats] = useState(readStats);

  const notify = message => { if (flash) flash(message); };
  const newSolo = level => {
    setDifficulty(level);
    setMode("solo");
    setSession({ id: `solo-${Date.now()}`, board: initialBoard(), turn: 1, move_count: 0, status: "playing", solo: true });
    setScreen("playing");
  };

  const createOnline = async () => {
    setLoading(true);
    try {
      const result = await bacteriaApi("/sessions", { method: "POST", body: "{}" });
      setSession(result.session); setMode("online"); setScreen("waiting");
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  };

  const joinOnline = async () => {
    if (joinCode.length !== 4) return;
    setLoading(true);
    try {
      const result = await bacteriaApi("/join", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      setSession(result.session); setMode("online"); setScreen("playing");
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (screen !== "waiting" || !session?.id) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const result = await bacteriaApi(`/sessions/${session.id}`);
        if (!active) return;
        setSession(result.session);
        if (result.session.status === "playing") setScreen("playing");
        if (result.session.status === "ended") { notify("La salle a été fermée"); setScreen("lobby"); }
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 1200);
    return () => { active = false; clearInterval(timer); };
  }, [screen, session?.id]);

  const leaveRoom = async () => {
    if (session?.id && mode === "online") bacteriaApi(`/sessions/${session.id}/leave`, { method: "POST", body: "{}" }).catch(() => {});
    setSession(null); setScreen("lobby");
  };

  if (screen === "playing" && session) return <BacteriaArena
    key={session.id}
    session={session}
    mode={mode}
    difficulty={difficulty}
    auth={auth}
    notify={notify}
    onExit={leaveRoom}
    onReplay={() => mode === "solo" ? newSolo(difficulty) : leaveRoom()}
    onResult={(won, margin) => setStats(recordResult(won, margin))}
  />;

  if (screen === "waiting") return <div className="bact"><style>{STYLE}</style><div className="bact-shell">
    <div className="bact-nav"><BackButton onClick={leaveRoom}/><div className="bact-brand"><span className="bact-live"/>Salle privée</div><div style={{ width: 40 }}/></div>
    <div className="bact-wait">
      <div className="bact-room-label">Code d’invitation</div><div className="bact-room-code">{session.code}</div>
      <div className="bact-player-row"><div className="bact-player-dot" style={{ background: `linear-gradient(145deg,${GREEN},${GREEN_DARK})` }}>{(session.host_name || "?")[0]}</div><div><strong>{session.host_name || session.host_code}</strong><small>Hôte · Culture verte</small></div></div>
      <div className="bact-player-row" style={{ opacity: .55 }}><div className="bact-player-dot" style={{ background: "rgba(255,255,255,.08)" }}>?</div><div><strong>En attente…</strong><small>Partage le code à ton adversaire</small></div></div>
      <div className="bact-spinner"/><div style={{ fontSize: 10, color: "rgba(255,255,255,.45)" }}>Connexion automatique dès qu’il rejoint</div>
    </div>
  </div></div>;

  if (screen === "join") return <div className="bact"><style>{STYLE}</style><div className="bact-shell">
    <div className="bact-nav"><BackButton onClick={() => setScreen("lobby")}/><div className="bact-brand"><span className="bact-live"/>Multijoueur</div><div style={{ width: 40 }}/></div>
    <div className="bact-panel">
      <h2>Rejoindre une culture</h2><p>Saisis les quatre lettres affichées chez l’hôte.</p>
      <input className="bact-code" autoCapitalize="characters" autoCorrect="off" spellCheck="false" maxLength={4} placeholder="CODE" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} onKeyDown={event => event.key === "Enter" && joinOnline()}/>
      <button className="bact-primary" style={{ width: "100%" }} disabled={loading || joinCode.length !== 4} onClick={joinOnline}>{loading ? "Connexion…" : "Entrer dans la partie"}</button>
    </div>
  </div></div>;

  return <div className="bact"><style>{STYLE}</style><div className="bact-shell">
    <div className="bact-nav"><BackButton onClick={() => setPage("home")}/><div className="bact-brand"><span className="bact-live"/>Bacteria Lab</div><button className="bact-icon-btn" onClick={() => setShowRules(true)} aria-label="Règles">?</button></div>
    <div className="bact-hero"><div className="bact-orb"><div className="bact-orb-grid">{Array.from({ length: 16 }, (_, index) => <i key={index}/>)}</div></div><h1 className="bact-title">Bacteria</h1><div className="bact-subtitle">Contamine · Convertis · Domine</div></div>
    <div className="bact-stats"><div className="bact-stat"><strong>{stats.games}</strong><span>Parties</span></div><div className="bact-stat"><strong>{stats.wins}</strong><span>Victoires</span></div><div className="bact-stat"><strong>{stats.streak}</strong><span>Série</span></div></div>
    <div className="bact-section-label">Affronter le laboratoire</div>
    <div className="bact-levels">
      <button className="bact-level" onClick={() => newSolo("easy")}><span className="bact-level-icon">🧫</span><b>Découverte</b><small>IA détendue pour apprendre</small></button>
      <button className="bact-level" onClick={() => newSolo("medium")}><span className="bact-level-icon">🧬</span><b>Tactique</b><small>Elle cherche les conversions</small></button>
      <button className="bact-level" onClick={() => newSolo("hard")}><span className="bact-level-icon">⚗️</span><b>Expert</b><small>Elle anticipe tes réponses</small></button>
    </div>
    <div className="bact-section-label">Duel privé · 1 contre 1</div>
    <div className="bact-online"><button className="bact-primary" disabled={loading} onClick={createOnline}>{loading ? "Création…" : "+ Créer une partie"}</button><button className="bact-secondary" onClick={() => setScreen("join")}>Rejoindre</button></div>
    <button className="bact-help" onClick={() => setShowRules(true)}>Voir les règles en 30 secondes</button>
    {showRules && <Rules onClose={() => setShowRules(false)}/>} 
  </div></div>;
}

function ScoreCard({ player, active, mine, name, count }) {
  const color = player === 1 ? GREEN : PURPLE;
  const shade = player === 1 ? GREEN_DARK : PURPLE_DARK;
  return <div className={`bact-score ${player === 1 ? "green" : "purple"} ${active ? "active" : ""}`}>
    <div className="bact-score-blob" style={{ background: `radial-gradient(circle at 30% 22%,#fff8 0 6%,${color} 20%,${shade} 82%)` }}/>
    <div style={{ minWidth: 0, flex: 1 }}><div className="bact-score-name">{name}{mine && <span className="bact-you">TOI</span>}</div><div className="bact-score-value" style={{ color }}>{count}</div></div>
  </div>;
}

function Blob({ player, selected }) {
  return <div className={`bact-blob ${player === 1 ? "green" : "purple"}`}>
    <div className="bact-eyes"><i className="bact-eye"/><i className="bact-eye"/></div><i className="bact-mouth"/>{selected && <i className="bact-selected-ring"/>}
  </div>;
}

function BacteriaArena({ session: initialSession, mode, difficulty, auth, notify, onExit, onReplay, onResult }) {
  const [session, setSession] = useState(initialSession);
  const [board, setBoard] = useState(() => parseBoard(initialSession.board));
  const [turn, setTurn] = useState(initialSession.turn || 1);
  const [moveCount, setMoveCount] = useState(initialSession.move_count || 0);
  const [selected, setSelected] = useState(null);
  const [reach, setReach] = useState(EMPTY_REACH);
  const [lastMove, setLastMove] = useState(initialSession.last_move || null);
  const [converted, setConverted] = useState([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [soundsOn, setSoundsOn] = useState(() => localStorage.getItem("drive_bacteria_sound") !== "off");
  const [toast, setToast] = useState("");
  const [ended, setEnded] = useState(() => initialSession.status === "ended" ? { winner: initialSession.winner, counts: countsFor(parseBoard(initialSession.board)) } : null);
  const resultRecorded = useRef(false);
  const currentBoard = useRef(board);
  const currentMoveCount = useRef(moveCount);

  useEffect(() => { currentBoard.current = board; }, [board]);
  useEffect(() => { currentMoveCount.current = moveCount; }, [moveCount]);
  const myPlayer = mode === "solo" ? 1 : String(session.host_code).toUpperCase() === String(auth.code).toUpperCase() ? 1 : 2;
  const greenName = myPlayer === 1 ? (auth.name || auth.code) : (session.host_name || "Vert");
  const purpleName = myPlayer === 2 ? (auth.name || auth.code) : (mode === "solo" ? ({ easy: "Culture novice", medium: "Culture tactique", hard: "Culture experte" }[difficulty]) : (session.guest_name || "Violet"));
  const counts = useMemo(() => countsFor(board), [board]);
  const occupied = Math.max(1, counts.green + counts.purple);
  const myColor = myPlayer === 1 ? GREEN : PURPLE;
  const isMyTurn = turn === myPlayer && !busy && !ended;
  const duplicateKeys = useMemo(() => new Set(reach.duplicate.map(cellKey)), [reach]);
  const jumpKeys = useMemo(() => new Set(reach.jump.map(cellKey)), [reach]);
  const convertedKeys = useMemo(() => new Set(converted.map(cellKey)), [converted]);

  const showToast = message => {
    setToast(message);
    setTimeout(() => setToast(""), 1800);
  };

  const finish = (winner, finalCounts) => {
    setEnded({ winner, counts: finalCounts });
    if (!resultRecorded.current) {
      resultRecorded.current = true;
      const won = winner === myPlayer;
      const mine = myPlayer === 1 ? finalCounts.green : finalCounts.purple;
      const theirs = myPlayer === 1 ? finalCounts.purple : finalCounts.green;
      onResult(won, mine - theirs);
      sound(won ? "win" : "lose", soundsOn);
    }
  };

  const revealMove = (nextBoard, nextTurn, nextMoveCount, move, status = "playing", winner = null) => {
    const parsedBoard = parseBoard(nextBoard);
    currentBoard.current = parsedBoard;
    currentMoveCount.current = nextMoveCount;
    setBoard(parsedBoard);
    setTurn(nextTurn);
    setMoveCount(nextMoveCount);
    setLastMove(move);
    setConverted(move?.converted || []);
    setSelected(null); setReach(EMPTY_REACH);
    sound("move", soundsOn);
    if (move?.converted?.length) setTimeout(() => sound("convert", soundsOn), 90);
    vibrate(move?.converted?.length ? [18, 35, 28] : 18);
    setTimeout(() => setConverted([]), 620);
    if (move?.passed) showToast("Adversaire bloqué · tu rejoues");
    if (status === "ended") finish(winner, countsFor(parsedBoard));
  };

  useEffect(() => {
    if (mode !== "online" || !session.id || ended) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const result = await bacteriaApi(`/sessions/${session.id}`);
        if (!active) return;
        const fresh = result.session;
        setSession(fresh);
        if (fresh.move_count > currentMoveCount.current) revealMove(fresh.board, fresh.turn, fresh.move_count, fresh.last_move, fresh.status, fresh.winner);
        else if (fresh.status === "ended") finish(fresh.winner, countsFor(parseBoard(fresh.board)));
      } catch {}
    };
    const timer = setInterval(poll, 1100);
    return () => { active = false; clearInterval(timer); };
  }, [mode, session.id, ended]);

  const playLocalMove = (from, to, player) => {
    const move = applyMove(currentBoard.current, player, from, to);
    const resolution = resolveTurn(move.board, player);
    const nextCount = currentMoveCount.current + 1;
    setBusy(true);
    revealMove(move.board, resolution.nextTurn, nextCount, { from, to, player, mode: move.mode, converted: move.converted, passed: resolution.passed }, resolution.ended ? "ended" : "playing", resolution.winner);
    setTimeout(() => setBusy(false), 440);
  };

  const submitMove = async (from, to) => {
    if (mode === "solo") { playLocalMove(from, to, myPlayer); return; }
    setBusy(true); setSyncing(true);
    try {
      const result = await bacteriaApi(`/sessions/${session.id}/moves`, { method: "POST", body: JSON.stringify({ from, to, moveCount: currentMoveCount.current }) });
      setSession(result.session);
      revealMove(result.session.board, result.session.turn, result.session.move_count, result.move, result.session.status, result.session.winner);
    } catch (error) {
      notify(error.message);
      try {
        const fresh = await bacteriaApi(`/sessions/${session.id}`);
        setSession(fresh.session); setBoard(parseBoard(fresh.session.board)); setTurn(fresh.session.turn); setMoveCount(fresh.session.move_count);
      } catch {}
    } finally { setBusy(false); setSyncing(false); }
  };

  const chooseCell = (row, column) => {
    if (!isMyTurn) return;
    const value = board[row][column];
    if (value === myPlayer) {
      if (selected?.[0] === row && selected?.[1] === column) { setSelected(null); setReach(EMPTY_REACH); return; }
      setSelected([row, column]); setReach(reachable(board, row, column)); sound("select", soundsOn); vibrate(8); return;
    }
    if (value === 0 && selected && (duplicateKeys.has(`${row}:${column}`) || jumpKeys.has(`${row}:${column}`))) submitMove(selected, [row, column]);
  };

  useEffect(() => {
    if (mode !== "solo" || ended || busy || turn !== 2) return undefined;
    const timer = setTimeout(() => {
      const move = pickAiMove(currentBoard.current, difficulty);
      if (!move) {
        const resolution = resolveTurn(currentBoard.current, 2);
        if (resolution.ended) finish(resolution.winner, resolution.counts); else setTurn(1);
        return;
      }
      playLocalMove(move.from, move.to, 2);
    }, difficulty === "easy" ? 520 : difficulty === "medium" ? 760 : 980);
    return () => clearTimeout(timer);
  }, [turn, mode, difficulty, ended, busy]);

  const toggleSound = () => {
    const next = !soundsOn; setSoundsOn(next);
    try { localStorage.setItem("drive_bacteria_sound", next ? "on" : "off"); } catch {}
    if (next) sound("select", true);
  };

  const status = ended ? "Analyse terminée" : syncing ? "Synchronisation…" : busy && mode === "solo" && turn === 2 ? "La culture évolue…" : isMyTurn ? "À toi de contaminer" : `Tour de ${turn === 1 ? greenName : purpleName}`;
  const statusColor = turn === 1 ? GREEN : PURPLE;

  return <div className="bact-arena"><style>{STYLE}</style><div className="bact-arena-shell">
    <div className="bact-arena-nav"><BackButton onClick={onExit}/><div className="bact-arena-name">Bacteria <span style={{ color: "rgba(255,255,255,.27)" }}>//</span> {mode === "solo" ? ({ easy: "Découverte", medium: "Tactique", hard: "Expert" }[difficulty]) : session.code}</div><span className="bact-move-number">COUP {moveCount}</span><button className="bact-icon-btn" onClick={toggleSound} aria-label="Son">{soundsOn ? "♪" : "×"}</button></div>
    <div className="bact-score-row"><ScoreCard player={1} active={turn === 1 && !ended} mine={myPlayer === 1} name={greenName} count={counts.green}/><ScoreCard player={2} active={turn === 2 && !ended} mine={myPlayer === 2} name={purpleName} count={counts.purple}/></div>
    <div className="bact-territory"><i className="bact-territory-green" style={{ width: `${counts.green / occupied * 100}%` }}/><i className="bact-territory-purple" style={{ width: `${counts.purple / occupied * 100}%` }}/></div>
    <div className="bact-status" style={{ color: statusColor }}><i className="bact-status-dot" style={{ background: statusColor, boxShadow: `0 0 10px ${statusColor}` }}/>{status}</div>
    <div className="bact-board-wrap"><div className="bact-board" role="grid" aria-label="Plateau Bacteria">
      {board.flatMap((rowValues, row) => rowValues.map((value, column) => {
        const key = `${row}:${column}`;
        const isDuplicate = duplicateKeys.has(key);
        const isJump = jumpKeys.has(key);
        const isSelected = selected?.[0] === row && selected?.[1] === column;
        const isLast = lastMove && (cellKey(lastMove.to) === key || cellKey(lastMove.from) === key);
        const canClick = isMyTurn && (value === myPlayer || (value === 0 && (isDuplicate || isJump)));
        return <button key={key} role="gridcell" className={`bact-cell ${canClick ? "playable" : ""} ${isDuplicate ? "duplicate" : ""} ${isJump ? "jump" : ""} ${isSelected ? "selected" : ""} ${isLast ? "last" : ""} ${convertedKeys.has(key) ? "converted" : ""}`} style={{ color: myColor }} onClick={() => chooseCell(row, column)} aria-label={value === -1 ? "Obstacle" : value === 0 ? `Case ${row + 1}, ${column + 1}` : `Bactérie ${value === 1 ? "verte" : "violette"}`}>
          {value === -1 && <i className="bact-rock"/>}{(value === 1 || value === 2) && <Blob player={value} selected={isSelected}/>} {value === 0 && isDuplicate && <span className="bact-target">+</span>} {value === 0 && isJump && <span className="bact-target jump">↝</span>}
        </button>;
      }))}
    </div></div>
    <div className="bact-bottom">{selected ? <span><strong>+</strong> duplique à une case · <strong>↝</strong> saute à deux cases</span> : isMyTurn ? "Sélectionne une de tes bactéries pour voir ses déplacements" : "Le plateau se met à jour automatiquement"}</div>
  </div>
  {toast && <div className="bact-toast">{toast}</div>}
  {ended && <div className="bact-end"><div className="bact-end-card"><div className="bact-trophy">{ended.winner === null ? "🤝" : ended.winner === myPlayer ? "🏆" : "🧪"}</div><h2 style={{ color: ended.winner === myPlayer ? GREEN : ended.winner === null ? "#ffe082" : PURPLE }}>{ended.winner === null ? "Équilibre parfait" : ended.winner === myPlayer ? "Culture dominante" : "Culture absorbée"}</h2><p>{ended.winner === null ? "Les deux colonies occupent le même territoire." : ended.winner === myPlayer ? "Tu as pris le contrôle du laboratoire." : "La prochaine mutation sera la bonne."}</p><div className="bact-final-score"><strong style={{ color: GREEN }}>{ended.counts.green}</strong><span>SCORE FINAL</span><strong style={{ color: PURPLE }}>{ended.counts.purple}</strong></div><div className="bact-end-actions"><button className="bact-secondary" onClick={onExit}>Quitter</button><button className="bact-primary" onClick={onReplay}>{mode === "solo" ? "Rejouer" : "Nouvelle salle"}</button></div></div></div>}
  </div>;
}
