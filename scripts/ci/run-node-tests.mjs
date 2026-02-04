#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { watch: false, coverage: false, help: false, roots: [] };

  for (const token of argv) {
    if (token === '--watch') {
      args.watch = true;
    } else if (token === '--coverage') {
      args.coverage = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else {
      args.roots.push(token);
    }
  }

  return args;
}

async function listTestFiles(rootDirAbs) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build'
      ) {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (/\.test\.(cjs|mjs|js)$/u.test(entry.name)) {
        results.push(full);
      }
    }
  }

  await walk(rootDirAbs);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function printHelp() {
  process.stdout.write(
    `${[
      'Usage:',
      '  node scripts/ci/run-node-tests.mjs [--watch] [--coverage] [root...]',
      '',
      'Examples:',
      '  node scripts/ci/run-node-tests.mjs tests',
      '  node scripts/ci/run-node-tests.mjs --watch tests/unit',
      '  node scripts/ci/run-node-tests.mjs --coverage tests/unit',
      '',
      'Notes:',
      '  This runner expands directories into explicit *.test.js files so it works on Windows and the Node test runner.',
    ].join('\n')}\n`
  );
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    printHelp();
    return;
  }

  const roots = cli.roots.length ? cli.roots : ['tests'];
  const rootDirsAbs = roots.map((r) => path.resolve(repoRoot, r));

  const allFiles = [];
  for (const rootAbs of rootDirsAbs) {
    // If user points to a single file, include it as-is.
    const stat = await fs.stat(rootAbs).catch(() => null);
    if (!stat) {
      continue;
    }

    if (stat.isFile()) {
      allFiles.push(rootAbs);
      continue;
    }

    if (stat.isDirectory()) {
      const files = await listTestFiles(rootAbs);
      allFiles.push(...files);
    }
  }

  const uniqueFiles = Array.from(new Set(allFiles));

  if (!uniqueFiles.length) {
    process.stderr.write(
      'No test files found. Expected files matching **/*.test.{js,mjs,cjs} under the provided roots.\n'
    );
    process.exitCode = 1;
    return;
  }

  const nodeArgs = [];
  if (cli.coverage) {
    nodeArgs.push('--experimental-test-coverage');
  }
  nodeArgs.push('--test');
  if (cli.watch) {
    nodeArgs.push('--watch');
  }
  nodeArgs.push(...uniqueFiles);

  const child = spawn(process.execPath, nodeArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (typeof code === 'number') {
      process.exitCode = code;
    } else {
      process.exitCode = signal ? 1 : 1;
    }
  });
}

main().catch((error) => {
  const message = error && typeof error.message === 'string' ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
