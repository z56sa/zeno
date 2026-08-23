// src/services/WhitelistService.ts

import { PrismaClient } from '@prisma/client';
import Logger from '../utils/logger';

const prisma = new PrismaClient();

class WhitelistService {
  static async add(guildId: string, targetId: string): Promise<void> {
    await prisma.whitelistUser.upsert({
      where: {
        userId_guildId: {
          userId: targetId,
          guildId,
        },
      },
      update: {},
      create: {
        userId: targetId,
        guildId,
      },
    });
    Logger.info(`Added user ${targetId} to whitelist for guild ${guildId}`);
  }

  static async remove(guildId: string, targetId: string): Promise<void> {
    await prisma.whitelistUser.deleteMany({
      where: { guildId, userId: targetId },
    });
    Logger.info(`Removed user ${targetId} from whitelist for guild ${guildId}`);
  }

  static async list(guildId: string): Promise<string[]> {
    const entries = await prisma.whitelistUser.findMany({
      where: { guildId },
    });
    return entries.map(e => e.userId);
  }

  static async hasAccess(guildId: string, userId: string): Promise<boolean> {
    const entry = await prisma.whitelistUser.findFirst({
      where: { guildId, userId },
    });
    return !!entry;
  }
}

export default WhitelistService;