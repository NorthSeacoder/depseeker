import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

export interface Fixture {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createFixture(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'depseeker-'));
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    })
  );

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function withFixture<T>(
  files: Record<string, string>,
  callback: (root: string) => Promise<T>
): Promise<T> {
  const fixture = await createFixture(files);
  try {
    return await callback(fixture.root);
  } finally {
    await fixture.cleanup();
  }
}
