/**
 * ★ [T-040 · 2026-11-18] **client_msg_id 生成器** —— 一条消息的「客户端真身份」。
 *
 * ## 为什么需要它（病根）
 *
 * 端侧的乐观 user 行与服务端那一行是两个**毫无关系**的身份
 * （本地 `pending-user-<ts>` / 安卓的负数 hash vs 服务端数据库自增）
 * ⇒ 端侧事后只能靠「**正文相同**」去猜哪条是同一条 ⇒
 * 用户问**两遍同一句** ⇒ 认错 · 端侧正文**被截断** ⇒ 认不出 ⇒ 这一族 bug 全从这里长出来
 * （双气泡 / 空气泡 / 顺序倒挂 / 幽灵行 / 停止键常亮）。
 *
 * ## 修法（业界标准，四篇资料一致）
 *
 * > 客户端生成稳定 ID（ULID / UUID）→ 随请求发给服务端 → 服务端按 `(user_id, client_msg_id)`
 * > **幂等去重** → 回执映射 `clientId → serverId` → 端侧**就地更新**那一行（不删不插）
 *
 * ## 为什么是 **ULID**（而不是 UUID、也不是 hash）
 *
 * · **ULID**（26 字符 Crockford Base32）：① **时间有序**（前 10 字符 = 48 位毫秒时间戳）
 *   ② 随机部分 80 位 ⇒ 不撞 ③ 短。
 * · **UUID v4** 也行，但**完全无序**。
 * · ⛔ **不能用 hash**：hash **会撞** ⇒ 一撞就误判「重复」⇒ **吞掉用户的消息**。
 *
 * ## 契约（跟服务端**逐字对齐**）
 *
 * · 服务端 unified-api `src/modules/yinian/client-msg-id.js`：
 *   `normalizeClientMsgId()` ⇒ 正则 `^[0-9A-Za-z_-]{8,64}$`
 * · 本实现产出：Crockford Base32 ⇒ 字符集 `[0-9A-Z]` ⊂ `[0-9A-Za-z_-]` ✔，长度 26 ∈ [8,64] ✔
 *
 * ⚠️ **端侧生成、服务端只收** —— 服务端**绝不**自己造一个 client_msg_id
 * ⇒ 两边不可能对不上。
 */

/**
 * Crockford Base32 字母表（32 个字符）。
 *
 * ⚠️ **故意不含** `I` / `L` / `O` / `U` —— Crockford 规范就是把它们排除掉
 * （避免跟 1/0 混淆）。⇒ 字母表里没有小写、也没有其它特殊字符
 * ⇒ 天然满足服务端那条 `^[0-9A-Za-z_-]{8,64}$`。
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 时间部分占 10 个字符 = 50 位（实际只用高 48 位毫秒时间戳）。 */
const TIME_LEN = 10;

/** 随机部分占 16 个字符 = 80 位。 */
const RANDOM_LEN = 16;

/** 总长度 = 26。 */
export const CLIENT_MSG_ID_LENGTH = TIME_LEN + RANDOM_LEN;

/**
 * 生成一个新的 client_msg_id。
 *
 * @param nowMs 时间戳（毫秒）—— 默认取当前时间。
 * @returns 26 字符的 ULID 串。
 */
export function generateClientMsgId(nowMs: number = Date.now()): string {
  const chars: string[] = [];
  // ── 时间部分: 48 位毫秒时间戳 → 10 个 Base32 字符（大端） ────────────────────
  // ⚠️ 只取低 48 位（ULID 规范如此）⇒ 毫秒时间戳到 10889 年才回绕。
  let ts = nowMs & 0xffffffffffff;
  for (let i = TIME_LEN - 1; i >= 0; i -= 1) {
    chars.push(ALPHABET[ts & 0x1f]);
    ts >>>= 5;
  }
  // ── 随机部分: 80 位 ⇒ 16 个 Base32 字符 ─────────────────────────────────────
  // ⚠️ 用 `crypto.getRandomValues`（**不可预测**）——
  //   `Math.random()` 是可预测的 ⇒ 同一台设备上两次生成的序列可能被人复现
  //   ⇒ id 被猜到 ⇒ 别人的消息被冒名顶替。
  const rnd = new Uint8Array(RANDOM_LEN);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(rnd);
  } else {
    // 老浏览器兜底（可预测 ⇒ 只在极端降级路径上用 ⇒ 仍远好过 hash 撞车）。
    for (let i = 0; i < RANDOM_LEN; i += 1) {
      rnd[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < RANDOM_LEN; i += 1) {
    // 每字节取**高 5 位**（低 3 位丢弃）⇒ 16 × 5 = 80 位
    chars.push(ALPHABET[(rnd[i] >>> 3) & 0x1f]);
  }
  return chars.join("");
}

/**
 * 这个串**是不是**一个合法的 client_msg_id —— 跟服务端 `normalizeClientMsgId` **同一把尺**。
 *
 * 端侧在**发请求之前**自检一把 ⇒ 不合法的 id 压根不出门
 * ⇒ 服务端那边「不合法 ⇒ 当没带」的兜底路径**永远走不到**。
 *
 * @param v 待校验的串
 * @returns 合不合法
 */
export function isValidClientMsgId(v: string | null | undefined): boolean {
  if (!v) return false;
  if (v.length < 8 || v.length > 64) return false;
  return /^[0-9A-Za-z_-]+$/.test(v);
}
