// src/database/client.ts

/**
 * Initializes and exports the Prisma client for PostgreSQL interactions.
 * Ensures a single instance is reused across the application to prevent
 * connection leaks.
 */

import { PrismaClient } from '@prisma/client';
import Logger from '../utils/logger';

const prisma = new PrismaClient();

prisma.$on('error' as never, (e: unknown) => {
  Logger.error('Prisma Error', e);
});

export default prisma;