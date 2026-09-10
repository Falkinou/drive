import crypto from "node:crypto";
import { pool, transaction } from "./db.js";
import { requireAuth } from "./auth.js";

export const BACTERIA_SIZE = 8;
export const BACTERIA_OBSTACLES = [[3, 3], [3, 4], [4, 3], [4, 4]];

const ACTIVE_STATUSES = new Set(["waiting", "playing"]);
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export function createBacteriaBoard() {
  const board = Array.from({ length: BACTERIA_SIZE }, () => Array(BACTERIA_SIZE).fill(0));
  for (const [row, column] of BACTERIA_OBSTACLES) board[row][column] = -1;
  board[0][0] = 1;
  board[BACTERIA_SIZE - 1][BACTERIA_SIZE - 1] = 2;
  return board;
}

function validCoordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(part => Number.isInteger(part) && part >= 0 && part < BACTERIA_SIZE);
}

export function parseBacteriaBoard(value) {
  let board = value;
  if (typeof board === "string") board = JSON.parse(board);
  if (!Array.isArray(board) || board.length !== BACTERIA_SIZE) throw new Error("Plateau invalide");
  if (!board.every(row => Array.isArray(row)
    && row.length === BACTERIA_SIZE
    && row.every(cell => [-1, 0, 1, 2].includes(cell)))) throw new Error("Plateau invalide");
  for (const [row, column] of BACTERIA_OBSTACLES) {
    if (board[row][column] !== -1) throw new Error("Plateau invalide");
  }
  return board.map(row => [...row]);
}

export function bacteriaReachable(board, row, column) {
  const duplicate = [];
  const jump = [];
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (targetRow < 0 || targetRow >= BACTERIA_SIZE || targetColumn < 0 || targetColumn >= BACTERIA_SIZE) continue;
      if (board[targetRow][targetColumn] !== 0) continue;
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
      (distance === 1 ? duplicate : jump).push([targetRow, targetColumn]);
    }
  }
  return { duplicate, jump };
}

export function bacteriaMoves(board, player) {
  const moves = [];
  for (let row = 0; row < BACTERIA_SIZE; row += 1) {
    for (let column = 0; column < BACTERIA_SIZE; column += 1) {
      if (board[row][column] !== player) continue;
      const reachable = bacteriaReachable(board, row, column);
      for (const [targetRow, targetColumn] of [...reachable.duplicate, ...reachable.jump]) {
        moves.push({ from: [row, column], to: [targetRow, targetColumn] });
      }
    }
  }
  return moves;
}

export function bacteriaCounts(board) {
  const counts = { green: 0, purple: 0, empty: 0 };
  for (const row of board) {
    for (const cell of row) {
      if (cell === 1) counts.green += 1;
      if (cell === 2) counts.purple += 1;
      if (cell === 0) counts.empty += 1;
    }
  }
  return counts;
}

export function applyBacteriaMove(board, player, from, to) {
  if (!validCoordinate(from) || !validCoordinate(to)) throw new Error("Coordonnées invalides");
  const [fromRow, fromColumn] = from;
  const [toRow, toColumn] = to;
  if (board[fromRow][fromColumn] !== player) throw new Error("Bactérie de départ invalide");
  if (board[toRow][toColumn] !== 0) throw new Error("Case d’arrivée occupée");
  const distance = Math.max(Math.abs(toRow - fromRow), Math.abs(toColumn - fromColumn));
  if (distance !== 1 && distance !== 2) throw new Error("Déplacement invalide");

  const nextBoard = board.map(row => [...row]);
  const mode = distance === 1 ? "duplicate" : "jump";
  if (mode === "jump") nextBoard[fromRow][fromColumn] = 0;
  nextBoard[toRow][toColumn] = player;

  const opponent = player === 1 ? 2 : 1;
  const converted = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const row = toRow + rowOffset;
      const column = toColumn + columnOffset;
      if (row < 0 || row >= BACTERIA_SIZE || column < 0 || column >= BACTERIA_SIZE) continue;
      if (nextBoard[row][column] === opponent) {
        nextBoard[row][column] = player;
        converted.push([row, column]);
      }
    }
  }
  return { board: nextBoard, mode, converted };
}

export function resolveBacteriaTurn(board, player) {
  const opponent = player === 1 ? 2 : 1;
  const counts = bacteriaCounts(board);
  const currentCanMove = bacteriaMoves(board, player).length > 0;
  const opponentCanMove = bacteriaMoves(board, opponent).length > 0;
  const ended = counts.empty === 0 || (!currentCanMove && !opponentCanMove);
  if (ended) {
    const winner = counts.green === counts.purple ? null : counts.green > counts.purple ? 1 : 2;
    return { ended: true, winner, nextTurn: player, passed: false, counts };
  }
  return {
    ended: false,
    winner: null,
    nextTurn: opponentCanMove ? opponent : player,
    passed: !opponentCanMove,
    counts,
  };
}

function publicSession(row) {
  return {
    ...row,
    board: parseBacteriaBoard(row.board),
    last_move: row.last_move || null,
  };
}

function participant(row, code) {
  return row.host_code === code || row.guest_code === code;
}

function sessionPlayer(row, code) {
  if (row.host_code === code) return 1;
  if (row.guest_code === code) return 2;
  return null;
}

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

function sendKnownError(error, res, next) {
  const status = error.status || (/invalide|occupée|tour|terminée/i.test(error.message) ? 400 : null);
  if (status) return res.status(status).json({ error: error.message });
  return next(error);
}

export function registerBacteriaRoutes(app) {
  app.use("/api/bacteria", requireAuth);

  app.post("/api/bacteria/sessions", async (req, res, next) => {
    try {
      let created;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        try {
          const result = await pool.query(
            `insert into bacteria_sessions (code, host_code, host_name, status, board, turn, move_count)
             values ($1, $2, $3, 'waiting', $4, 1, 0) returning *`,
            [randomCode(), req.auth.code, req.auth.name || req.auth.code, JSON.stringify(createBacteriaBoard())],
          );
          created = result.rows[0];
          break;
        } catch (error) {
          if (error.code !== "23505") throw error;
        }
      }
      if (!created) return res.status(503).json({ error: "Impossible de créer une partie" });
      return res.status(201).json({ session: publicSession(created), player: 1 });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/bacteria/join", async (req, res, next) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!/^[A-HJ-NP-Z]{4}$/.test(code)) return res.status(400).json({ error: "Code de partie invalide" });
    try {
      const joined = await transaction(async client => {
        const result = await client.query(
          "select * from bacteria_sessions where code = $1 and status = 'waiting' order by created_at desc limit 1 for update",
          [code],
        );
        const session = result.rows[0];
        if (!session) {
          const error = new Error("Partie introuvable ou déjà commencée");
          error.status = 404;
          throw error;
        }
        if (session.host_code === req.auth.code) {
          const error = new Error("Tu ne peux pas rejoindre ta propre partie");
          error.status = 409;
          throw error;
        }
        const updated = await client.query(
          `update bacteria_sessions
              set guest_code = $1, guest_name = $2, status = 'playing'
            where id = $3 and status = 'waiting' returning *`,
          [req.auth.code, req.auth.name || req.auth.code, session.id],
        );
        if (updated.rowCount !== 1) {
          const error = new Error("Cette partie vient d’être rejointe");
          error.status = 409;
          throw error;
        }
        return updated.rows[0];
      });
      return res.json({ session: publicSession(joined), player: 2 });
    } catch (error) {
      return sendKnownError(error, res, next);
    }
  });

  app.get("/api/bacteria/sessions/:id", async (req, res, next) => {
    try {
      const result = await pool.query("select * from bacteria_sessions where id = $1", [req.params.id]);
      const session = result.rows[0];
      if (!session || !participant(session, req.auth.code)) return res.status(404).json({ error: "Partie introuvable" });
      return res.json({ session: publicSession(session), player: sessionPlayer(session, req.auth.code) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/bacteria/sessions/:id/moves", async (req, res, next) => {
    try {
      const payload = await transaction(async client => {
        const result = await client.query("select * from bacteria_sessions where id = $1 for update", [req.params.id]);
        const session = result.rows[0];
        if (!session || !participant(session, req.auth.code)) {
          const error = new Error("Partie introuvable");
          error.status = 404;
          throw error;
        }
        if (session.status !== "playing") {
          const error = new Error("Cette partie est terminée");
          error.status = 409;
          throw error;
        }
        const player = sessionPlayer(session, req.auth.code);
        if (session.turn !== player) {
          const error = new Error("Ce n’est pas ton tour");
          error.status = 409;
          throw error;
        }
        if (Number(req.body?.moveCount) !== session.move_count) {
          const error = new Error("La partie a évolué, le plateau a été actualisé");
          error.status = 409;
          throw error;
        }

        const board = parseBacteriaBoard(session.board);
        const move = applyBacteriaMove(board, player, req.body?.from, req.body?.to);
        const resolution = resolveBacteriaTurn(move.board, player);
        const lastMove = {
          from: req.body.from,
          to: req.body.to,
          player,
          mode: move.mode,
          converted: move.converted,
          passed: resolution.passed,
        };
        const updated = await client.query(
          `update bacteria_sessions
              set board = $1, turn = $2, move_count = move_count + 1,
                  status = $3, winner = $4, ended_at = $5, last_move = $6
            where id = $7 returning *`,
          [
            JSON.stringify(move.board),
            resolution.nextTurn,
            resolution.ended ? "ended" : "playing",
            resolution.winner,
            resolution.ended ? new Date() : null,
            lastMove,
            session.id,
          ],
        );
        return { session: updated.rows[0], move: lastMove };
      });
      return res.json({ session: publicSession(payload.session), move: payload.move });
    } catch (error) {
      return sendKnownError(error, res, next);
    }
  });

  app.post("/api/bacteria/sessions/:id/leave", async (req, res, next) => {
    try {
      const result = await pool.query("select * from bacteria_sessions where id = $1", [req.params.id]);
      const session = result.rows[0];
      if (!session || !participant(session, req.auth.code)) return res.status(404).json({ error: "Partie introuvable" });
      if (!ACTIVE_STATUSES.has(session.status)) return res.json({ session: publicSession(session) });
      const leavingPlayer = sessionPlayer(session, req.auth.code);
      const winner = session.status === "playing" ? (leavingPlayer === 1 ? 2 : 1) : null;
      const updated = await pool.query(
        "update bacteria_sessions set status = 'ended', winner = $1, ended_at = now() where id = $2 returning *",
        [winner, session.id],
      );
      return res.json({ session: publicSession(updated.rows[0]) });
    } catch (error) {
      return next(error);
    }
  });
}
