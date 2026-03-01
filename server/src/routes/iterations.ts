/**
 * C5: Iteration query routes (spec §5.2, Stage 2 API).
 *
 * Mounted at: /api/sessions/:id/iterations
 *
 * GET   /      — list all iteration summaries for session
 * GET   /:num  — get specific iteration with actions
 */
import { Router } from 'express';
import { iterationRepo } from '../db/repos/iterationRepo.js';

const router = Router({ mergeParams: true });

// GET /iterations
router.get('/', async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const iters = await iterationRepo.listBySession(id);
    return res.json(iters);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'DB error' });
  }
});

// GET /iterations/:num
router.get('/:num', async (req, res) => {
  const { id, num } = req.params as { id: string; num: string };
  const iterNum = parseInt(num, 10);
  if (isNaN(iterNum)) return res.status(400).json({ error: 'Invalid iteration number' });

  try {
    const all = await iterationRepo.listBySession(id);
    const iter = all.find(i => i.number === iterNum);
    if (!iter) return res.status(404).json({ error: `Iteration ${iterNum} not found` });

    const detail = await iterationRepo.getWithActions(iter.id);
    return res.json(detail);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'DB error' });
  }
});

export default router;
