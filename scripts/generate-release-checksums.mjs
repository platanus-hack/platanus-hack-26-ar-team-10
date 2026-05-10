import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assertSafeReleasePath(file) {
  if (!file || file.includes('..') || file.startsWith('/')) {
    throw new Error(`refusing unsafe release path: ${file}`);
  }
}

export async function generateChecksums({ cwd = process.cwd(), files, outputFile = 'checksums.txt' }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('files must be a non-empty array');
  }

  const lines = [];
  for (const file of files) {
    assertSafeReleasePath(file);
    const bytes = await readFile(join(cwd, file));
    const hash = createHash('sha256').update(bytes).digest('hex');
    lines.push(`${hash}  ${file}`);
  }

  await writeFile(join(cwd, outputFile), `${lines.join('\n')}\n`);
  return { outputFile, lines };
}

async function main() {
  const files = process.argv.slice(2);
  await generateChecksums({ files });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
