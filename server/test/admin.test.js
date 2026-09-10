import assert from "node:assert/strict";
import test from "node:test";
import { safeDetails } from "../src/audit.js";
import { periodBounds } from "../src/admin.js";

test("custom team period includes an equally long comparison window", () => {
  const bounds = periodBounds({ from: "2026-09-01T00:00:00Z", to: "2026-09-11T00:00:00Z" });
  assert.equal(bounds.end - bounds.start, bounds.previousEnd - bounds.previousStart);
  assert.equal(bounds.previousEnd.toISOString(), bounds.start.toISOString());
});

test("team periods reject invalid and excessive ranges", () => {
  assert.throws(() => periodBounds({ from: "2026-09-12", to: "2026-09-11" }), /Période invalide/);
  assert.throws(() => periodBounds({ from: "2020-01-01", to: "2026-01-01" }), /Période trop longue/);
});

test("audit details never store secrets", () => {
  assert.deepEqual(safeDetails({ name: "Loïc", pin: "1234", token: "secret", role: "admin" }), { name: "Loïc", role: "admin" });
});
