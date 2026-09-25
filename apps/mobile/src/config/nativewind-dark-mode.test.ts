/// <reference types="node" />

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const mobileRoot = process.cwd();
const configPath = resolve(mobileRoot, 'tailwind.config.js');
const inputPath = resolve(mobileRoot, 'global.css');
const tailwindExecutable =
  process.platform === 'win32'
    ? resolve(mobileRoot, 'node_modules/.bin/tailwindcss.cmd')
    : resolve(mobileRoot, 'node_modules/.bin/tailwindcss');

describe('NativeWind dark mode', () => {
  it('generates class-based CSS interop mode from the real Tailwind build', async () => {
    // Given
    const outputDirectory = await mkdtemp(join(tmpdir(), 'nativewind-dark-mode-'));
    const outputPath = join(outputDirectory, 'generated.css');

    try {
      // When
      await execFileAsync(
        tailwindExecutable,
        [
          '--config',
          configPath,
          '--input',
          inputPath,
          '--output',
          outputPath,
        ],
        { cwd: mobileRoot, maxBuffer: 10 * 1024 * 1024 },
      );

      // Then
      const generatedCss = await readFile(outputPath, 'utf8');
      expect(generatedCss).toContain('--css-interop-darkMode: class dark');
      expect(generatedCss).not.toContain('--css-interop-darkMode: media');
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
