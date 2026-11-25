/** T-143 · hook 桥「端口被占用 ⇒ 自动换端口并同步更新 hook URL」回归钉。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..');
const svc = readFileSync(join(REPO, 'electron/client-tools/claudeCodeHookService.ts'), 'utf8');

test('T143-1 · 固定端口起桥失败 ⇒ 回落随机端口', () => {
  assert.ok(/startHookBridge\(\{ \.\.\.base, \.\.\.installed \}\)/.test(svc),
    '★ 必须先试装过 hook 的固定端口');
  assert.ok(/catch \(e\)[\s\S]{0,200}h = null/.test(svc),
    '★ 固定端口起失败要吞掉并回落');
  assert.ok(/startHookBridge\(\{ \.\.\.base, port: DEFAULT_HOOK_BRIDGE_PORT, token: bridgeToken\(\) \}\)/.test(svc),
    '★ 回落必须用随机端口（0）+ 新 token');
});

test('T143-2 · 换端口后把已装的 hook URL 改写成新端口', () => {
  assert.ok(/if \(installed\) \{[\s\S]{0,600}installHook\(\{/.test(svc),
    '★ 换端口后必须更新 settings.json 里我们那条 hook URL（否则 Claude Code 还打旧地址）');
  assert.ok(/const url = hookUrl\(h\.port, h\.token\)/.test(svc), '★ 新 URL 要带新端口与 token');
});

test('T143-3 · MCP launcher 动态读 hook URL ⇒ 端口变了自动跟上', () => {
  const mcp = readFileSync(join(REPO, 'electron/client-tools/gaclawMcpSetup.ts'), 'utf8');
  assert.ok(mcp.includes("path.join(os.homedir(), '.claude', 'settings.json')"),
    '★ launcher 必须每次读 settings（不能缓存端口）');
  assert.ok(mcp.includes('findHookConnection'), '★ launcher 每次调用都要重新解析 hook 连接');
});
