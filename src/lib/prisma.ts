// HACK: https://github.com/prisma/prisma/issues/5030#issuecomment-1398076317
import type { PrismaClient as ImportedPrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url ?? __filename);

const { PrismaClient: RequiredPrismaClient } = require('@prisma/client');

const _PrismaClient: typeof ImportedPrismaClient = RequiredPrismaClient;

class PrismaClient extends _PrismaClient {}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;