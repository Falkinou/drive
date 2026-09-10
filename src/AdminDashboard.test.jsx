// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminOverview, AdminTeam } from "./AdminDashboard";
import { AdminSystem, formatBytes } from "./AdminOperations";

afterEach(cleanup);

const dashboard = {
  generatedAt: new Date().toISOString(),
  totals: { sites: 509, gps: 470, mobile: 400, anfr: 320, accounts_total: 5, accounts_active: 4, visits_month: 42, visits_previous_month: 35, actions_30d: 80, actions_previous_30d: 75, failed_logins_24h: 2, stale_mobile_30d: 14 },
  percentages: { gps: 92, anfr: 80 },
  visits7d: [{ day: "2026-09-10", count: 6 }],
  recentActivity: [{ id: "a1", technician_name: "Loïc", technician_code: "LA", site_name: "Mulhouse", action: "edit", created_at: new Date().toISOString() }],
};

describe("administration", () => {
  it("affiche les indicateurs agrégés sans rendre les alertes cliquables", () => {
    render(<AdminOverview data={dashboard} onRefresh={() => {}} />);
    expect(screen.getByText("509")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Sites sans GPS").closest("button")).toBeNull();
    expect(screen.getByText(/Loïc · Mulhouse/)).toBeTruthy();
  });

  it("charge l’analyse équipe depuis l’API et accepte les dates personnalisées", async () => {
    const request = vi.fn().mockResolvedValue({ technicians: [{ id: "t1", code: "LA", name: "Loïc Arnold", active: true, visits: 12, unique_sites: 8, active_days: 5, actions: 9, edits: 4, photos: 3, notes: 2, previous_visits: 10, previous_actions: 8, last_activity: new Date().toISOString() }] });
    render(<AdminTeam request={request} />);
    expect(await screen.findByText("Loïc Arnold")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("/admin/team?period=month");
    fireEvent.click(screen.getByRole("button", { name: "Dates" }));
    expect(screen.getByText("DU")).toBeTruthy();
    await waitFor(() => expect(request.mock.calls.some(call => call[0].includes("period=custom"))).toBe(true));
  });

  it("affiche les mesures réelles du VPS", async () => {
    const request = vi.fn().mockResolvedValue({ generatedAt: new Date().toISOString(), api: { responseMs: 8, uptimeSeconds: 90000, node: "v22" }, database: { sizeBytes: 10485760, connections: 3, version: "16" }, storage: { uploadBytes: 2097152, freeBytes: 80, usedBytes: 20, totalBytes: 100, usedPercent: 20 }, backup: { healthy: true, count: 4, bytes: 4096, latest: { createdAt: new Date().toISOString(), size: 2048 } }, host: { hostname: "drive-api", load: [0.1, 0.2, 0.3], memoryTotalBytes: 100, memoryFreeBytes: 40 } });
    render(<AdminSystem request={request} />);
    expect(await screen.findByText("Supervision du VPS")).toBeTruthy();
    expect(screen.getByText("10 Mo")).toBeTruthy();
    expect(screen.getByText("À jour")).toBeTruthy();
  });
});

it("formate les tailles de stockage", () => {
  expect(formatBytes(1024)).toBe("1.0 Ko");
  expect(formatBytes(10 * 1024 * 1024)).toBe("10 Mo");
});
