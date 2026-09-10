import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBacteriaMove,
  bacteriaCounts,
  bacteriaMoves,
  createBacteriaBoard,
  parseBacteriaBoard,
  resolveBacteriaTurn,
} from "../src/bacteria.js";

test("initial board is valid and starts with one bacteria per player", () => {
  const board = createBacteriaBoard();
  assert.deepEqual(bacteriaCounts(board), { green: 1, purple: 1, empty: 58 });
  assert.deepEqual(parseBacteriaBoard(JSON.stringify(board)), board);
  assert.ok(bacteriaMoves(board, 1).length > 0);
  assert.ok(bacteriaMoves(board, 2).length > 0);
});

test("duplicate keeps the source and converts adjacent enemies", () => {
  const board = createBacteriaBoard();
  board[1][1] = 2;
  const move = applyBacteriaMove(board, 1, [0, 0], [0, 1]);
  assert.equal(move.mode, "duplicate");
  assert.equal(move.board[0][0], 1);
  assert.equal(move.board[0][1], 1);
  assert.equal(move.board[1][1], 1);
  assert.deepEqual(move.converted, [[1, 1]]);
});

test("jump clears the source", () => {
  const move = applyBacteriaMove(createBacteriaBoard(), 1, [0, 0], [2, 2]);
  assert.equal(move.mode, "jump");
  assert.equal(move.board[0][0], 0);
  assert.equal(move.board[2][2], 1);
});

test("a blocked opponent passes without ending the game", () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill(1));
  board[3][3] = -1;
  board[3][4] = -1;
  board[4][3] = -1;
  board[4][4] = -1;
  board[7][7] = 2;
  board[0][1] = 0;
  const result = resolveBacteriaTurn(board, 1);
  assert.equal(result.ended, false);
  assert.equal(result.passed, true);
  assert.equal(result.nextTurn, 1);
});

test("game ends when the board is full", () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill(1));
  board[3][3] = -1;
  board[3][4] = -1;
  board[4][3] = -1;
  board[4][4] = -1;
  board[7][7] = 2;
  const result = resolveBacteriaTurn(board, 2);
  assert.equal(result.ended, true);
  assert.equal(result.winner, 1);
});
