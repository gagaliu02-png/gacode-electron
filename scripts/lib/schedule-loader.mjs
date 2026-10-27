/**
 * scripts/lib/schedule-loader.mjs
 *
 * 断言脚本共用加载器 —— 把 src/ 下的 .ts 编译成 ESM 落到**系统临时目录**再 import。
 *
 * 为什么需要它 (与 web 版同款的两类坑):
 *
 *   1. **新增的相对依赖**。schedule-api.ts import ./schedule-http, 它再 import ./api
 *      —— Node ESM 的相对导入**必须带扩展名**, 编译产物里是 "./schedule-http" / "./api" ——
 *      直接落盘会 ERR_MODULE_NOT_FOUND。loader 负责把裸相对路径改写成 .mjs。
 *
 *   2. **.ts 被当成 .tsx 解析**。`const asArray = <T>(v: unknown): T[] => …` 这种泛型箭头,
 *      在 jsx=ReactJSX 且没给 fileName 时会被 TS 当 JSX 解析 → `Unexpected token '<'`。
 *      所以 loader 一律传 `fileName`, 让 TS 按扩展名走 TS 解析。
 *
 * ⚠️ **与 web 版 loader 的三处差异** (PC 侧移植, 2026-10-27):
 *
 *   1. **加载链去掉 nav.ts / api-base.ts** —— web 的 schedule-http 从 ./nav + ./api-base
 *      取 BASE_PATH / API_BASE; PC 的 JWT 在**内存** (api.ts 的 getAccessToken),
 *      base 直接写在 schedule-http.ts 里 ⇒ 这两个模块 PC 用不上。
 *
 *   2. **没有 utils / `cn` 垫片** —— PC 全仓无 cn / clsx / tailwind-merge / cva
 *      (className 用 ["a","b"].filter(Boolean).join(" ")) ⇒ 不需要 web loader 那套
 *      `writeJs("utils", ...)` 垫片, 本 loader 也不写。
 *
 *   3. **临时目录建在 os.tmpdir()** —— web 建在**项目根**
 *      (mkdtempSync(join(process.cwd(), '.xxx-tmp-'))) ⇒ 跑一次就在仓库根留一个垃圾目录。
 *      PC 改写到系统临时目录, 进程退出时清掉。
 *
 * ⚠️ **node_modules 解析**: 临时目录在系统盘 ⇒ 裸包 (date-fns, 走 api.ts → notifications.ts)
 *    从临时目录里解析不到本仓 node_modules ⇒ loader 在临时目录里建一个 **junction**
 *    指向 <repo>/node_modules (Windows junction 不需要管理员权限; POSIX 上是普通软链)。
 *
 * ⚠️ **PC 侧没有 schedule-mocks fixture** (web 的 fixture 断言家族依赖它) ⇒
 *    本 loader **不加载 mocks**, 也不导出 fixture 相关的常量; 各断言脚本自带 fixture。
 *
 * 数据流: fixture (脚本自带) → api.normalize* (运行时映射)
 *      → api.buildFlatIndex (拍平 + 图算法) → api.bucketTodaySchedules (五桶)
 *   即「真后端出参 → 前端 DTO」这条真实链路, 但输入固定 = 结果可重现。
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 仓库根 (scripts/lib/ → scripts/ → repo root)。 */
export const ROOT = join(__dirname, "..", "..");

const srcFile = (rel) => join(ROOT, rel);

/** PC 的日程域源文件位置 (与 web 的目录结构一致, 只换根)。 */
export const SCHEDULE_SRC = {
  notifications: "src/lib/notifications.ts",
  api: "src/lib/api.ts",
  http: "src/lib/schedule-http.ts",
  scheduleApi: "src/lib/schedule-api.ts",
  format: "src/components/schedule/format.ts",
  calendarUtils: "src/components/schedule/calendar-utils.ts",
  formRules: "src/components/schedule/form/scheduleFormRules.ts",
  formInit: "src/components/schedule/form/scheduleFormInit.ts",
  formBody: "src/components/schedule/form/scheduleFormBody.ts",
  detailModel: "src/components/schedule/detail/detailModel.ts",
  archived: "src/components/schedule/archived.ts",
};

/**
 * transpile — TS → ESM。
 * @param src   源码
 * @param jsx   true = .tsx (React 自动 runtime); false = .ts (泛型箭头才不会被当 JSX)
 */
export const transpile = (src, jsx = false) =>
  ts.transpileModule(src, {
    fileName: jsx ? "mod.tsx" : "mod.ts",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
      strict: false,
      jsx: jsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
    },
  }).outputText;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 在**系统临时目录**下建临时目录, 退出时清理。
 *
 *   ⚠️ 不用项目根 (web 的做法) —— 那会在仓库根留垃圾目录 (契约 L3)。
 *   ⚠️ 同时建一个 node_modules **junction** 指向本仓 node_modules ——
 *      临时目录在系统盘, 裸包 (date-fns) 走这条路才能解析到。
 */
export function makeTmpDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `gacode-${prefix}-`));
  const link = join(dir, "node_modules");
  try {
    symlinkSync(join(ROOT, "node_modules"), link, "junction");
  } catch {
    // 建不了 junction (权限 / 平台限制) 也不致命 —— 只有需要裸包的链 (api.ts
    // → notifications.ts → date-fns) 会失败, 断言脚本会在 import 处明确报错。
  }
  process.on("exit", () => {
    try {
      // 先摘 junction (只删链接, 不碰真身), 再删目录。
      rmSync(link, { force: true });
    } catch {
      /* swallow */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* swallow */
    }
  });
  return dir;
}

/**
 * 把 TS 源码写成 .mjs (必要时先改写 import 的目标)。
 *
 * @param rewriteImports  [源字面量, 目标字面量] 列表 —— 逐个替换 `from "<源字面量>"`。
 *                        例: ["./api", "./api.mjs"] / ["@/lib/schedule-api", "./schedule-api.mjs"]
 */
export function writeModule(dir, name, src, { jsx = false, rewriteImports = [] } = {}) {
  let out = src;
  for (const [from, to] of rewriteImports) {
    out = out.replace(
      new RegExp(`from\\s+["']${escapeRe(from)}["']`, "g"),
      `from "${to}"`,
    );
  }
  writeFileSync(join(dir, `${name}.mjs`), transpile(out, jsx), "utf8");
  return pathToFileURL(join(dir, `${name}.mjs`)).href;
}

const readSrc = (rel) => readFileSync(srcFile(rel), "utf8");

/**
 * 加载日程域的**核心两层** (schedule-api + schedule-http)。
 *
 *   加载链: notifications → api → schedule-http → schedule-api
 *   ⚠️ PC 没有 nav / api-base (见文件头说明)。
 *   ⚠️ api.ts 里 `import type ... from "../components/chat/ExecutionTimeline"` 是
 *      **类型导入** ⇒ 编译时被抹掉, 不需要 ExecutionTimeline 参与加载。
 */
export async function loadScheduleModules(dir) {
  writeModule(dir, "notifications", readSrc(SCHEDULE_SRC.notifications));
  writeModule(dir, "api", readSrc(SCHEDULE_SRC.api), {
    rewriteImports: [["./notifications", "./notifications.mjs"]],
  });
  const httpUrl = writeModule(dir, "schedule-http", readSrc(SCHEDULE_SRC.http), {
    rewriteImports: [["./api", "./api.mjs"]],
  });
  const apiUrl = writeModule(dir, "schedule-api", readSrc(SCHEDULE_SRC.scheduleApi), {
    rewriteImports: [["./schedule-http", "./schedule-http.mjs"]],
  });

  const [api, http] = await Promise.all([import(apiUrl), import(httpUrl)]);
  return { api, http };
}

/**
 * 加载日程域的**纯逻辑层** (format / calendar-utils / 表单三件套 / 详情模型 / 归档口径)。
 *
 *   这些文件只依赖 schedule-api 的类型 + 少数纯函数 ⇒ 跟核心两层一起加载即可。
 *   ⚠️ 全部平铺进同一个临时目录 ⇒ 相对 import 一律写成 "./xxx.mjs"。
 */
export async function loadScheduleLogic(dir) {
  const core = await loadScheduleModules(dir);

  const formatUrl = writeModule(dir, "format", readSrc(SCHEDULE_SRC.format));
  const calendarUrl = writeModule(dir, "calendar-utils", readSrc(SCHEDULE_SRC.calendarUtils), {
    rewriteImports: [
      ["./format", "./format.mjs"],
      ["../../lib/schedule-api", "./schedule-api.mjs"],
    ],
  });
  const rulesUrl = writeModule(dir, "scheduleFormRules", readSrc(SCHEDULE_SRC.formRules));
  const initUrl = writeModule(dir, "scheduleFormInit", readSrc(SCHEDULE_SRC.formInit), {
    rewriteImports: [
      ["./scheduleFormRules", "./scheduleFormRules.mjs"],
      ["../../../lib/schedule-api", "./schedule-api.mjs"],
    ],
  });
  const bodyUrl = writeModule(dir, "scheduleFormBody", readSrc(SCHEDULE_SRC.formBody), {
    rewriteImports: [
      ["./scheduleFormRules", "./scheduleFormRules.mjs"],
      ["../../../lib/schedule-api", "./schedule-api.mjs"],
    ],
  });
  const detailUrl = writeModule(dir, "detailModel", readSrc(SCHEDULE_SRC.detailModel), {
    rewriteImports: [["../../../lib/schedule-api", "./schedule-api.mjs"]],
  });
  const archivedUrl = writeModule(dir, "archived", readSrc(SCHEDULE_SRC.archived), {
    rewriteImports: [["../../lib/schedule-api", "./schedule-api.mjs"]],
  });

  const [format, calendarUtils, formRules, formInit, formBody, detailModel, archived] =
    await Promise.all([
      import(formatUrl),
      import(calendarUrl),
      import(rulesUrl),
      import(initUrl),
      import(bodyUrl),
      import(detailUrl),
      import(archivedUrl),
    ]);

  return {
    ...core,
    format,
    calendarUtils,
    formRules,
    formInit,
    formBody,
    detailModel,
    archived,
  };
}
