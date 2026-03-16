import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { listProjectsForUser } from '../services/projects';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const projects = await listProjectsForUser(req.user!.id);
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

export default router;