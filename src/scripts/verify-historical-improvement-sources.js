const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const manifestPath = process.env.SAFE_HISTORICAL_MANIFEST
    ? path.resolve(process.env.SAFE_HISTORICAL_MANIFEST)
    : path.join(projectRoot, 'docs', 'HISTORICAL_IMPROVEMENT_SOURCES.json');
  if (!existsSync(manifestPath)) throw new Error(`Historical source manifest not found: ${manifestPath}`);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.entries) || !manifest.historicalRoot) {
    throw new Error('Historical source manifest is missing entries or historicalRoot.');
  }
  const historicalRoot = path.resolve(
    process.env.SAFE_HISTORICAL_ROOT || manifest.historicalRoot,
  );
  const errors = [];
  for (const entry of manifest.entries) {
    if (typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      errors.push(`${entry.path ?? '<unknown>'}: malformed manifest entry`);
      continue;
    }
    const filePath = path.resolve(historicalRoot, entry.path);
    const relativePath = path.relative(historicalRoot, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      errors.push(`${entry.path}: path escapes historical root`);
      continue;
    }
    if (!existsSync(filePath)) {
      errors.push(`${entry.path}: missing`);
      continue;
    }
    if (await sha256(filePath) !== entry.sha256) errors.push(`${entry.path}: SHA-256 mismatch`);
  }

  if (errors.length) {
    console.error(`Historical source verification failed: ${errors.length} issue(s).`);
    for (const error of errors.slice(0, 20)) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Verified ${manifest.entries.length} historical source hashes.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
