import { PrismaClient } from '@prisma/client';
import { resolveDatabaseConfiguration } from './database-config';

const { url: databaseUrl } = resolveDatabaseConfiguration();
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

export default prisma;
