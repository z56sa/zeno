// src/api/routes/whitelist.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import WhitelistService from '../../services/WhitelistService';

const router = Router();

const addSchema = z.object({
  userId: z.string().min(1),
});

router.get('/:guildId', async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const list = await WhitelistService.list(guildId);
  res.json({ guildId, whitelist: list });
});

router.post('/:guildId/:userId', async (req: Request, res: Response) => {
  const { guildId, userId } = req.params;
  await WhitelistService.add(guildId, userId);
  res.status(201).json({ message: 'User added to whitelist.' });
});

router.delete('/:guildId/:userId', async (req: Request, res: Response) => {
  const { guildId, userId } = req.params;
  await WhitelistService.remove(guildId, userId);
  res.json({ message: 'User removed from whitelist.' });
});

export default router;