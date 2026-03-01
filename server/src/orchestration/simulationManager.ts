/**
 * C4: SimulationManager — in-memory state and SSE broadcasting per session (spec §9).
 *
 * Manages:
 * - Running/paused/abort flags per session
 * - Connected SSE client list
 * - Event broadcasting
 */
import type { Response } from 'express';

export type SimulationStatus = 'idle' | 'running' | 'paused';

interface SimulationState {
  status: SimulationStatus;
  abortRequested: boolean;
  pauseRequested: boolean;
  clients: Set<Response>;
}

export type SimulationEvent =
  | { type: 'iteration-start'; iteration: number; total: number }
  | { type: 'agent-intent'; agentId: string; agentName: string; intent: string }
  | { type: 'resolution'; iteration: number; narrativeSummary: string; lifecycleEvents: unknown[] }
  | { type: 'iteration-complete'; iteration: number; stats: Record<string, unknown> }
  | { type: 'simulation-complete'; finalReport: string }
  | { type: 'paused'; iteration: number }
  | { type: 'error'; message: string };

class SimulationManager {
  private sessions = new Map<string, SimulationState>();

  private getOrCreate(sessionId: string): SimulationState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        status: 'idle',
        abortRequested: false,
        pauseRequested: false,
        clients: new Set(),
      });
    }
    return this.sessions.get(sessionId)!;
  }

  getStatus(sessionId: string): SimulationStatus {
    return this.sessions.get(sessionId)?.status ?? 'idle';
  }

  start(sessionId: string): void {
    const state = this.getOrCreate(sessionId);
    state.status = 'running';
    state.abortRequested = false;
    state.pauseRequested = false;
  }

  pause(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state && state.status === 'running') {
      state.pauseRequested = true;
    }
  }

  resume(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state && state.status === 'paused') {
      state.status = 'running';
      state.pauseRequested = false;
    }
  }

  abort(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.abortRequested = true;
    }
  }

  isPauseRequested(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.pauseRequested ?? false;
  }

  isAbortRequested(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.abortRequested ?? false;
  }

  setPaused(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.status = 'paused';
      state.pauseRequested = false;
    }
  }

  /** Called when simulation ends (complete or abort). */
  finish(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.status = 'idle';
      state.abortRequested = false;
      state.pauseRequested = false;
      // Drain clients — they'll receive the final event then disconnect
    }
  }

  addClient(sessionId: string, res: Response): void {
    const state = this.getOrCreate(sessionId);
    state.clients.add(res);
    res.on('close', () => {
      state.clients.delete(res);
    });
  }

  broadcast(sessionId: string, event: SimulationEvent): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.clients.size === 0) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of state.clients) {
      try {
        client.write(data);
      } catch {
        state.clients.delete(client);
      }
    }
  }
}

export const simulationManager = new SimulationManager();
