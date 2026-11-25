/** T-142 · gaclaw MCP 全局工具配置的最小回归（纯函数 + launcher 内容）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..');
const M = await import('../electron/client-tools/gaclawMcpSetup.ts');
const src = readFileSync(join(REPO, 'electron/client-tools/gaclawMcpSetup.ts'), 'utf8');
const exec = readFileSync(join(REPO, 'electron/client-tools/executor.ts'), 'utf8');
const fmt = readFileSync(join(REPO, 'electron/client-tools/claudeResultFormat.ts'), 'utf8');

test('T142-1 · 工具名与 server 名固定（链路统一）', () => {
  assert.equal(M.MCP_SERVER_NAME, 'gaclaw');
  assert.equal(M.MCP_TOOL_NAME, 'mcp__gaclaw__send');
});

test('T142-2 · upsertMcpServersConfig 幂等写入 user scope MCP', () => {
  const launcher = 'C:/Users/gaga/.gaclaw/mcp/gaclaw-msg-mcp.mjs';
  const r1 = M.upsertMcpServersConfig({}, launcher);
  assert.equal(r1.changed, true);
  assert.equal(r1.data.mcpServers.gaclaw.command, 'node');
  assert.deepEqual(r1.data.mcpServers.gaclaw.args, [launcher]);
  const r2 = M.upsertMcpServersConfig(r1.data, launcher);
  assert.equal(r2.changed, false);
  // 不碰其它 server
  const r3 = M.upsertMcpServersConfig({ mcpServers: { other: { command: 'x' } } }, launcher);
  assert.equal(r3.changed, true);
  assert.equal(r3.data.mcpServers.other.command, 'x');
});

test('T142-3 · upsertPermissionsAllow 幂等放行 MCP 工具', () => {
  const r1 = M.upsertPermissionsAllow({ permissions: { allow: ['WebSearch'] } });
  assert.equal(r1.changed, true);
  assert.ok(r1.data.permissions.allow.includes('mcp__gaclaw__send'));
  assert.ok(r1.data.permissions.allow.includes('WebSearch'));
  const r2 = M.upsertPermissionsAllow(r1.data);
  assert.equal(r2.changed, false);
  assert.equal(r2.data.permissions.allow.filter((x) => x === 'mcp__gaclaw__send').length, 1);
});

test('T142-4 · launcher 是最小 MCP stdio server，只暴露 send', () => {
  assert.ok(M.MCP_SERVER_SOURCE.includes("const TOOL = 'send'"));
  assert.ok(M.MCP_SERVER_SOURCE.includes("method === 'initialize'"));
  assert.ok(M.MCP_SERVER_SOURCE.includes("method === 'tools/list'"));
  assert.ok(M.MCP_SERVER_SOURCE.includes("method === 'tools/call'"));
  assert.ok(M.MCP_SERVER_SOURCE.includes('/cc-tools/send'));
  assert.ok(!M.MCP_SERVER_SOURCE.includes('userId'), '不允许模型传身份字段');
});

test('T142-5 · notify 契约/默认文案统一指向 mcp__gaclaw__send + 结果块兜底', () => {
  assert.ok(fmt.includes('mcp__gaclaw__send'));
  assert.ok(fmt.includes('端侧会自动采集兜底'));
  assert.ok(exec.includes('mcp__gaclaw__send'));
  assert.ok(exec.includes('若没有该 MCP 工具'));
  assert.ok(!exec.includes('必须使用 gaclaw-msg send'));
});

test('T142-6 · main.ts 启动时调用 ensureGaclawMcpConfigured', () => {
  const main = readFileSync(join(REPO, 'electron/main.ts'), 'utf8');
  assert.ok(main.includes('ensureGaclawMcpConfigured()'));
});
