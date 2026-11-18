/**
 * electron/instance-guard.ts —— **执行器实例锁**（T-038 方案 A）
 *
 * ## 为什么需要它（本次事故的根因）
 *
 *   Electron 自带的 `app.requestSingleInstanceLock()` 的锁键 = **调用它那一刻的 userData 路径**。
 *   而本仓把 userData 改到 `%APPDATA%\Gacode` 是**在 `app.whenReady()` 里**做的
 *   （`main.ts` 的 `setPath('userData', …)`）⇒ **锁在改路径之前就拿好了**。
 *
 *   ⇒ 于是：
 *     · dev 实例（`electron .`，package.json name = `gacode-electron`）
 *       ⇒ 内建锁键 = `%APPDATA%\gacode-electron`；
 *     · 安装/便携版（productName = `Gacode`）
 *       ⇒ 内建锁键 = `%APPDATA%\Gacode`。
 *
 *   **两把不同的锁 ⇒ 两个实例都能起来**；但两者后来都把 userData 指到 `%APPDATA%\Gacode`
 *   ⇒ **同一份登录态、同一个 device id、同一个审计文件** ⇒ 同一条派单被**两个进程同时执行**
 *   ⇒ 旧代码那个实例 400ms 就回 `{status:'sent'}` **抢先结算**
 *   ⇒ 新代码那个实例等 205s 拿到真结果再上传 ⇒ **409「结果已结过」⇒ 真结果被丢弃**。
 *
 *   （2026-11-18 实测：unified 日志同一 pendingId 两次 POST result = 200 然后 409。）
 *
 * ## 这个模块做什么
 *
 *   一把**显式的、带身份的锁**，锁键 = **最终 userData 目录**（与 setPath 时机无关）：
 *
 *     `%APPDATA%\Gacode\instance.lock`  ← 默认（dev 与 release **共用这一把**）
 *     `%APPDATA%\Gacode-<profile>\instance.lock` ← 显式 profile（合法多实例逃生阀）
 *
 *   锁文件里记 `{pid, instanceId, startedAt, heartbeatAt}`：
 *   · 抢锁时读旧 owner ⇒ 判活（心跳新鲜 **或** pid 还活着）⇒ 活着就让位；
 *   · 活着 → 后启动者**让位**（并请求把已有窗口拉到前台）；
 *   · 死了（心跳过期 + pid 不在）→ 接管（覆盖锁文件）；
 *   · 每 30s 心跳 ⇒ 崩溃残留的锁会被下一个实例判定为死 ⇒ 自动接管。
 *
 * ## 逃生阀：合法多实例（PM 要求「dev 与 release 不能互相锁死」）
 *
 *   环境变量 `GACODE_INSTANCE_PROFILE=<name>` ⇒
 *   **userData 与锁都落到 `%APPDATA%\Gacode-<name>`** ⇒ 独立登录态、独立 device id、
 *   独立锁 ⇒ 两个实例可以并存，且**不会抢结算**（结算位 = pendingId，服务端按 device 分发）。
 *
 *   ⚠️ 代价：独立 profile 要**重新登录一次**；同一账号的第二个 device 可能触发服务端
 *   「设备顶替」（`device_replaced`）⇒ 需要在 UI 上说清楚。
 *
 * ## 为什么是纯逻辑（零 electron import）
 *
 *   `node --test` 能直接跑 ⇒ 单测覆盖「首次拿锁 / 二次拿不到 / 心跳过期可接管 /
 *   只删自己的锁 / profile 路径不同 ⇒ 锁不同」。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/** 锁文件名（落在最终 userData 目录下）。 */
export const INSTANCE_LOCK_FILE = 'instance.lock';
/** 「把已有窗口拉到前台」的请求文件名。 */
export const INSTANCE_FOCUS_FILE = 'instance.focus-request';
/** 心跳间隔（毫秒）—— 主进程定时器用。 */
export const INSTANCE_HEARTBEAT_MS = 30_000;
/** 超过这个时间没有心跳 ⇒ 判 owner 死亡（可被接管）。 */
export const INSTANCE_STALE_MS = 90_000;

/** 一个实例的「身份 + 落点」。 */
export interface InstanceProfile {
  /** 最终 userData 目录。 */
  userDataDir: string;
  /** 锁文件绝对路径。 */
  lockFile: string;
  /** 聚焦请求文件绝对路径。 */
  focusRequestFile: string;
  /** profile 名（空 = 默认）。 */
  profile: string;
}

/** 锁文件里的内容。 */
export interface LockOwner {
  /** 锁协议版本（以后要加字段时用）。 */
  version: number;
  /** owner 进程 pid。 */
  pid: number;
  /** 本次启动的唯一 id（进程重启后 pid 可能复用 ⇒ 用它区分）。 */
  instanceId: string;
  /** 启动时刻。 */
  startedAt: number;
  /** 最后一次心跳时刻。 */
  heartbeatAt: number;
}

/**
 * 算实例身份（userData / 锁 / 聚焦请求的落点）。
 *
 * @param appDataRoot  `%APPDATA%`（Windows）/ `~/Library/Application Support`（mac）
 * @param profile      profile 名；空/未给 = 默认（dev 与 release 共用）
 */
export function resolveProfile(appDataRoot: string, profile?: string | null): InstanceProfile {
  const p = String(profile || '').trim();
  const safe = p.replace(/[^a-zA-Z0-9_-]/g, '');
  const userDataDir = path.join(appDataRoot, safe ? `Gacode-${safe}` : 'Gacode');
  return {
    userDataDir,
    lockFile: path.join(userDataDir, INSTANCE_LOCK_FILE),
    focusRequestFile: path.join(userDataDir, INSTANCE_FOCUS_FILE),
    profile: safe,
  };
}

/** 读锁文件（不存在 / 坏了 ⇒ null）。 */
export function readOwner(lockFile: string): LockOwner | null {
  try {
    const raw = fs.readFileSync(lockFile, 'utf8');
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    if (typeof d.pid !== 'number' || typeof d.instanceId !== 'string') return null;
    return {
      version: typeof d.version === 'number' ? d.version : 1,
      pid: d.pid,
      instanceId: d.instanceId,
      startedAt: typeof d.startedAt === 'number' ? d.startedAt : 0,
      heartbeatAt: typeof d.heartbeatAt === 'number' ? d.heartbeatAt : 0,
    };
  } catch {
    return null;
  }
}

/** 默认的 pid 存活判定（Windows 上 `process.kill(pid, 0)` 对存在但无权限的进程会 EPERM ⇒ 也算活着）。 */
export function defaultPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e && e.code === 'EPERM';
  }
}

/**
 * owner 还活着吗？
 *
 * ★ [2026-11-18 修正] **主判据 = pid 还在不在**（不是心跳）。
 *   原来写的是「心跳新鲜 **或** pid 活着 ⇒ 算活」⇒ **刚被 kill 掉的实例心跳还在
 *   90 秒窗口内** ⇒ 被判成「活着」⇒ **用户「关掉 App 马上重开」会被拒**
 *   （第二个实例让位退出 ⇒ App 看起来「打不开」；实测踩到了：v0.7.35 起不来就是这个原因）。
 *   ⇒ 现在：**pid 活着 ⇒ 活着；pid 不在 ⇒ 死了（可被接管）**；
 *     心跳只作**诊断**（看 owner 是否还活着在刷心跳），不参与判活。
 */
export function isOwnerAlive(
  owner: LockOwner | null,
  now: number,
  opts: { staleMs?: number; pidAlive?: (pid: number) => boolean } = {},
): boolean {
  if (!owner) return false;
  const pidAlive = opts.pidAlive ?? defaultPidAlive;
  // 进程还在 ⇒ 活着（不管心跳多旧）。
  if (pidAlive(owner.pid)) return true;
  // 进程不在 ⇒ 死了 ⇒ 可被接管（**心跳新鲜也不算活** —— 见上面的修正说明）。
  void now;
  void opts.staleMs;
  return false;
}

/** 抢锁的结果。 */
export type AcquireResult =
  | { ok: true; owner: LockOwner }
  | { ok: false; reason: 'held_by_live_instance'; owner: LockOwner };

/**
 * 抢锁。
 *
 * @returns `ok:true` = 我是 owner；`ok:false` = 有一个**活着**的 owner（让位给它）
 */
export function acquireInstanceLock(
  lockFile: string,
  opts: {
    instanceId?: string;
    now?: number;
    staleMs?: number;
    pidAlive?: (pid: number) => boolean;
    pid?: number;
  } = {},
): AcquireResult {
  const now = opts.now ?? Date.now();
  const instanceId = opts.instanceId || randomUUID();
  const prev = readOwner(lockFile);
  if (prev && isOwnerAlive(prev, now, opts)) {
    return { ok: false, reason: 'held_by_live_instance', owner: prev };
  }
  const owner: LockOwner = {
    version: 1,
    pid: opts.pid ?? process.pid,
    instanceId,
    startedAt: now,
    heartbeatAt: now,
  };
  writeOwner(lockFile, owner);
  return { ok: true, owner };
}

/** 原子写锁文件（先写临时文件再 rename ⇒ 不会读到半截 JSON）。 */
export function writeOwner(lockFile: string, owner: LockOwner): void {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const tmp = `${lockFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(owner), 'utf8');
  try {
    fs.renameSync(tmp, lockFile);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error('instance lock write failed');
  }
}

/**
 * 心跳（只有 owner 自己能续）。
 *
 * @returns true = 续上了；false = 锁已经不是我的了（被抢/被删）⇒ 调用方应当让位
 */
export function heartbeatInstanceLock(
  lockFile: string,
  instanceId: string,
  now: number = Date.now(),
): boolean {
  const cur = readOwner(lockFile);
  if (!cur || cur.instanceId !== instanceId) return false;
  writeOwner(lockFile, { ...cur, heartbeatAt: now });
  return true;
}

/**
 * 释放锁（**只有 owner 自己能删** ⇒ 不会出现「A 退出把 B 的锁删了」）。
 */
export function releaseInstanceLock(lockFile: string, instanceId: string): boolean {
  const cur = readOwner(lockFile);
  if (!cur) return false;
  if (cur.instanceId !== instanceId) return false;
  try {
    fs.unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * 把「让位原因」落盘（**portable launcher 会吞掉子进程 stdout** ⇒ 光打 console 查不到）。
 *
 * 落点 = 锁文件旁边：`%APPDATA%\Gacode\instance-yield.log`（一行一条，带时间戳）。
 */
export function appendYieldLog(dir: string, line: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "instance-yield.log"),
      `${new Date().toISOString()} ${line}
`,
      "utf8",
    );
  } catch {
    /* ignore —— 诊断用，失败不影响让位 */
  }
}

/** 请求「把已有实例的窗口拉到前台」（后启动者让位时调用）。 */
export function requestFocus(focusRequestFile: string, payload?: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(focusRequestFile), { recursive: true });
    fs.writeFileSync(
      focusRequestFile,
      JSON.stringify({ ts: Date.now(), ...(payload || {}) }),
      'utf8',
    );
  } catch {
    /* ignore —— 聚焦是锦上添花，失败不影响让位 */
  }
}

/** 消费聚焦请求（owner 侧心跳时调用）⇒ 有请求就把窗口拉到前台并删掉请求文件。 */
export function consumeFocusRequest(focusRequestFile: string): boolean {
  try {
    if (!fs.existsSync(focusRequestFile)) return false;
    fs.unlinkSync(focusRequestFile);
    return true;
  } catch {
    return false;
  }
}
