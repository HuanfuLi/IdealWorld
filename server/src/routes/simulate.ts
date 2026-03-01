/**
 * C5: Simulation control routes (spec §5.2, Stage 2 API).
 *
 * Mounted at: /api/sessions/:id/simulate
 *
 * POST   /        — start simulation
 * POST   /pause   — pause
 * POST   /resume  — resume
 * POST   /abort   — abort
 * GET    /stream  — SSE event stream
 */
import { Router } from 'express';
import { sessionRepo } from '../db/repos/sessionRepo.js';
import { runSimulation } from '../orchestration/simulationRunner.js';
import { simulationManager } from '../orchestration/simulationManager.js';

const router = Router({ mergeParams: true });

// POST /simulate — start simulation
router.post('/', async (req, res) => {
  const { id } = req.params as { id: string };
  const totalIterations = Number(req.body?.iterations ?? 20);

  if (!Number.isInteger(totalIterations) || totalIterations < 1 || totalIterations > 200) {
    return res.status(400).json({ error: 'iterations must be an integer between 1 and 200' });
  }

  const session = await sessionRepo.getById(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const status = simulationManager.getStatus(id);
  if (status === 'running') {
    return res.status(409).json({ error: 'Simulation already running' });
  }

  // Fire-and-forget: run in background
  runSimulation(id, totalIterations).catch(err =>
    console.error('[simulate route] unhandled error:', err)
  );

  return res.json({ ok: true });
});

// POST /simulate/pause
router.post('/pause', (req, res) => {
  const { id } = req.params as { id: string };
  const status = simulationManager.getStatus(id);
  if (status !== 'running') {
    return res.status(409).json({ error: 'No running simulation to pause' });
  }
  simulationManager.pause(id);
  return res.json({ ok: true });
});

// POST /simulate/resume
router.post('/resume', (req, res) => {
  const { id } = req.params as { id: string };
  const status = simulationManager.getStatus(id);
  if (status !== 'paused') {
    return res.status(409).json({ error: 'Simulation is not paused' });
  }
  simulationManager.resume(id);
  return res.json({ ok: true });
});

// POST /simulate/abort
router.post('/abort', (req, res) => {
  const { id } = req.params as { id: string };
  simulationManager.abort(id);
  return res.json({ ok: true });
});

// GET /simulate/stream — SSE long-lived connection
router.get('/stream', (req, res) => {
  const { id } = req.params as { id: string };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Establish connection
  res.write(': connected\n\n');

  simulationManager.addClient(id, res);

  // Keep-alive ping every 15s
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 15000);

  req.on('close', () => clearInterval(ping));
});

export default router;
