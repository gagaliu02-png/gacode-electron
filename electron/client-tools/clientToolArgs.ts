/**
 * [T-111] 端侧工具参数 fail-fast。
 *
 * 原则：端侧只接受工具公开参数；服务端内部字段（delivery_id/envelope/receipt/reply_to 等）
 * 不允许出现在模型传给工具的 args 里。任何参数错误必须在副作用前返回。
 */
export interface ArgValidationResult {
  ok: boolean
  missing: string[]
  unknown: string[]
  invalid: string[]
  message?: string
  hint?: string
}

type Rule = {
  required?: string[]
  string?: string[]
  bool?: string[]
  number?: string[]
  enum?: Record<string, readonly unknown[]>
  intRange?: Record<string, [number, number]>
  minLength?: Record<string, number>
  maxLength?: Record<string, number>
}

const COMMON_INTERNAL_FIELDS = new Set([
  'delivery_id', 'deliveryId', 'envelope', 'receipt', 'origin', 'from_id', 'fromId',
  'to_session', 'toSession', 'reply_to', 'replyTo', 'reply_to_business_session_id',
  'reply_to_cc_session_id', 'reply_channel', 'pending_id', 'user_id',
  'senderRole', 'sent_at', 'task_notification',
]);

const RULES: Record<string, Rule> = {
  pc_cc_sessions: { bool: ['only_vscode'] },
  pc_cc_read: { required: ['session_id'], string: ['session_id'], intRange: { max_turns: [1, 50] }, minLength: { session_id: 1 }, maxLength: { session_id: 200 } },
  pc_cc_send: {
    required: ['session_id', 'text'], string: ['session_id', 'text', 'task_id'],
    enum: { priority: ['now', 'next', 'later'] }, minLength: { session_id: 1, text: 1 },
    maxLength: { session_id: 200, text: 100000, task_id: 200 },
  },
  pc_cc_control: {
    required: ['session_id', 'action'], string: ['session_id', 'action', 'name'],
    enum: { action: ['rename', 'notify_when_idle'] }, minLength: { session_id: 1 },
    maxLength: { session_id: 200, action: 64, name: 200 },
  },
  pc_claude: { required: ['task'], string: ['task', 'cwd'], intRange: { max_turns: [1, 1000] }, minLength: { task: 1 }, maxLength: { task: 100000, cwd: 1000 } },
  pc_cc_new: { required: ['task'], string: ['task', 'cwd'], intRange: { max_turns: [1, 1000] }, minLength: { task: 1 }, maxLength: { task: 100000, cwd: 1000 } },
  pc_job_start: { required: ['command'], string: ['command', 'cwd'], minLength: { command: 1 }, maxLength: { command: 100000, cwd: 1000 } },
  pc_job_status: { required: ['job_id'], string: ['job_id'], minLength: { job_id: 1 } },
  pc_job_stop: { required: ['job_id'], string: ['job_id'], minLength: { job_id: 1 } },
  pc_shell: { required: ['command'], string: ['command', 'cwd'], minLength: { command: 1 }, maxLength: { command: 100000, cwd: 1000 } },
  pc_read_file: { required: ['path'], string: ['path'], minLength: { path: 1 } },
  pc_write_file: { required: ['path', 'content'], string: ['path', 'content'], minLength: { path: 1 } },
  pc_list_dir: { required: ['path'], string: ['path'], minLength: { path: 1 } },
  pc_project: { string: ['path'] },
  pc_screenshot: { string: ['path'], bool: ['full_page'] },
  pc_open_path: { required: ['path'], string: ['path'], minLength: { path: 1 } },
  pc_system_info: {},
  pc_process_list: {},
};

function allowedKeys(rule: Rule): Set<string> {
  const keys = new Set<string>();
  for (const group of [rule.required, rule.string, rule.bool, rule.number]) {
    for (const k of group || []) keys.add(k);
  }
  for (const k of Object.keys(rule.enum || {})) keys.add(k);
  for (const k of Object.keys(rule.intRange || {})) keys.add(k);
  for (const k of Object.keys(rule.minLength || {})) keys.add(k);
  for (const k of Object.keys(rule.maxLength || {})) keys.add(k);
  return keys;
}

export function validateClientToolArgs(tool: string, args: Record<string, unknown> | null): ArgValidationResult {
  const rule = RULES[tool];
  if (!rule) return { ok: true, missing: [], unknown: [], invalid: [] }; // 未知工具由 executor 原路径拒绝
  const a = args && typeof args === 'object' ? args : {};
  const allowed = allowedKeys(rule);
  const missing = (rule.required || []).filter((k) => {
    const v = a[k];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
  const unknown = Object.keys(a).filter((k) => !allowed.has(k) && (
    COMMON_INTERNAL_FIELDS.has(k) || k.includes('reply') || k.includes('receipt') || k.includes('envelope')
  ));
  const invalid: string[] = [];
  for (const k of rule.string || []) if (a[k] !== undefined && typeof a[k] !== 'string') invalid.push(k);
  for (const k of rule.bool || []) if (a[k] !== undefined && typeof a[k] !== 'boolean') invalid.push(k);
  for (const k of rule.number || []) if (a[k] !== undefined && typeof a[k] !== 'number' && typeof a[k] !== 'string') invalid.push(k);
  for (const [k, values] of Object.entries(rule.enum || {})) {
    if (a[k] !== undefined && !values.includes(a[k])) invalid.push(k);
  }
  for (const [k, [min, max]] of Object.entries(rule.intRange || {})) {
    if (a[k] === undefined) continue;
    const n = typeof a[k] === 'number' ? a[k] : Number(a[k]);
    if (!Number.isFinite(n) || n < min || n > max) invalid.push(k);
  }
  for (const [k, min] of Object.entries(rule.minLength || {})) {
    if (typeof a[k] === 'string' && a[k].trim().length < min) invalid.push(k);
  }
  for (const [k, max] of Object.entries(rule.maxLength || {})) {
    if (typeof a[k] === 'string' && a[k].length > max) invalid.push(k);
  }
  const ok = missing.length === 0 && unknown.length === 0 && invalid.length === 0;
  return {
    ok,
    missing,
    unknown,
    invalid,
    message: ok ? undefined : `端侧工具 ${tool} 参数不合法`,
    hint: ok ? undefined : '只传工具公开参数；delivery_id/envelope/receipt/reply_to 等是服务端内部字段，不能出现在工具参数里。',
  };
}
