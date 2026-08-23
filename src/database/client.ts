// src/database/client.ts

import { PrismaClient } from '@prisma/client';
import Logger from '../utils/logger';

const prisma = new PrismaClient();

prisma.$on('error' as never, (e: unknown) => {
  Logger.error('Prisma Error', e);
});

export default prisma;