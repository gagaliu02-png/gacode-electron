import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTOR = path.join(ROOT, 'electron/client-tools/executor.ts');
const DEVICE = path.join(ROOT, 'electron/client-tools/deviceClient.ts');

test('T-063 pc_screenshot stdout 带 shotId + upload pending（上传回写契约）', () => {
  const src = fs.readFileSync(EXECUTOR, 'utf8');
  assert.match(src, /async function pcScreenshot/);
  assert.match(src, /const shotId = randomUUID\(\)/);
  assert.match(src, /tool: 'pc_screenshot'[\s\S]*?shotId[\s\S]*?upload: \{[\s\S]*?shotId, status: 'pending'/);
  assert.match(src, /gacode-screenshot-\$\{Date\.now\(\)\}-\$\{shotId\}\.png/);
});

test('T-063 deviceClient 上传回写同时覆盖 browser shot 与 full screenshot', () => {
  const src = fs.readFileSync(DEVICE, 'utf8');
  assert.match(src, /parsed\.tool === 'pc_browser_shot' \|\| parsed\.tool === 'pc_screenshot'/);
});
