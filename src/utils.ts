import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from 'tsconfig-paths';

export interface TsConfigInfo {
  readonly absolutePath: string;
  readonly baseUrl: string;
  readonly paths: Record<string, string[]>;
}

export async function loadTsConfig(tsConfigPath: string): Promise<TsConfigInfo | null> {
  const result = loadConfig(tsConfigPath);
  if (result.resultType === 'failed') {
    return null;
  }

  return {
    absolutePath: result.configFileAbsolutePath,
    baseUrl: result.absoluteBaseUrl,
    paths: result.paths ?? {},
  };
}

export async function resolveFileWithExtensions(
  candidate: string,
  extensionsWithDot: readonly string[],
  cache?: Map<string, string | null>
): Promise<string | null> {
  const normalizedCandidate = path.normalize(candidate);
  const cacheKey = `${normalizedCandidate}|${extensionsWithDot.join(',')}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const attempts = new Set<string>();
  attempts.add(normalizedCandidate);

  if (!extensionsWithDot.some((ext) => normalizedCandidate.endsWith(ext))) {
    for (const ext of extensionsWithDot) {
      attempts.add(`${normalizedCandidate}${ext}`);
    }
  }

  const resolved = await tryResolveAttempts(Array.from(attempts), extensionsWithDot, cache);
  if (cache) {
    cache.set(cacheKey, resolved);
  }
  return resolved;
}

async function tryResolveAttempts(
  attempts: string[],
  extensionsWithDot: readonly string[],
  cache?: Map<string, string | null>
): Promise<string | null> {
  for (const attempt of attempts) {
    const existing = await resolveSingleAttempt(attempt, extensionsWithDot, cache);
    if (existing) {
      return existing;
    }
  }
  return null;
}

async function resolveSingleAttempt(
  attempt: string,
  extensionsWithDot: readonly string[],
  cache?: Map<string, string | null>
): Promise<string | null> {
  try {
    const fileStat = await stat(attempt);
    if (fileStat.isFile()) {
      return attempt;
    }
    if (fileStat.isDirectory()) {
      const directoryResolution = await resolveDirectoryEntry(attempt, extensionsWithDot, cache);
      if (directoryResolution) {
        return directoryResolution;
      }
    }
  } catch {
    // continue
  }
  return null;
}

async function resolveDirectoryEntry(
  directory: string,
  extensionsWithDot: readonly string[],
  cache?: Map<string, string | null>
): Promise<string | null> {
  const pkgPath = path.join(directory, 'package.json');
  try {
    await access(pkgPath);
    const packageJson = JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, unknown>;
    const mainEntry = resolvePackageEntryField(packageJson);
    if (mainEntry) {
      const entryPath = path.resolve(directory, mainEntry);
      const resolved = await resolveFileWithExtensions(entryPath, extensionsWithDot, cache);
      if (resolved) {
        return resolved;
      }
    }
  } catch {
    // ignore missing package.json
  }

  for (const ext of extensionsWithDot) {
    const indexCandidate = path.join(directory, `index${ext}`);
    try {
      const indexStat = await stat(indexCandidate);
      if (indexStat.isFile()) {
        return indexCandidate;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function resolvePackageEntryField(pkg: Record<string, unknown>): string | null {
  const candidates = [pkg.module, pkg.main, typeof pkg.exports === 'string' ? pkg.exports : null];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}

export function toProjectRelative(targetPath: string, baseDir: string): string {
  const relativePath = path.relative(baseDir, targetPath);
  return relativePath.split(path.sep).join('/');
}
