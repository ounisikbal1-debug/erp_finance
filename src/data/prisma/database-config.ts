export type DatabaseProvider = 'sqlite' | 'postgresql';

export interface DatabaseConfiguration {
  provider: DatabaseProvider;
  url: string;
}

function withPostgresqlConnectionLimit(url: string): string {
  const parsedUrl = new URL(url);
  if (!parsedUrl.searchParams.has('connection_limit')) {
    parsedUrl.searchParams.set('connection_limit', '10');
  }
  return parsedUrl.toString();
}

export function resolveDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConfiguration {
  const providerValue = environment.SAFE_ERP_DATABASE_PROVIDER ?? 'sqlite';
  if (providerValue !== 'sqlite' && providerValue !== 'postgresql') {
    throw new Error('SAFE_ERP_DATABASE_PROVIDER must be either "sqlite" or "postgresql".');
  }
  const provider: DatabaseProvider = providerValue;
  const isTestEnvironment = environment.NODE_ENV === 'test';
  const configuredUrl = isTestEnvironment
    ? environment.SAFE_ERP_TEST_DATABASE_URL
    : environment.SAFE_ERP_DATABASE_URL;
  const url = configuredUrl
    ?? (provider === 'sqlite'
      ? isTestEnvironment
        ? 'file:memorydb?mode=memory&cache=shared'
        : 'file:../data.db'
      : undefined);

  if (!url) {
    throw new Error(
      `${isTestEnvironment ? 'SAFE_ERP_TEST_DATABASE_URL' : 'SAFE_ERP_DATABASE_URL'} ` +
      'must explicitly identify the PostgreSQL database.',
    );
  }

  if (provider === 'sqlite' && !url.startsWith('file:')) {
    throw new Error('The SQLite provider requires a Prisma file: database URL.');
  }
  if (provider === 'postgresql' && !/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error('The PostgreSQL provider requires a postgres:// or postgresql:// URL.');
  }

  return {
    provider,
    url: provider === 'postgresql' ? withPostgresqlConnectionLimit(url) : url,
  };
}
