// [2026-11-04 · 批 G12] PC「我的」页 + 「设置」页跟 web 对齐的回归断言
//
// ---------------------------------------------------------------------------
// 现象 (gaga 2026-11-04 截图 + 原话)
// ---------------------------------------------------------------------------
//   「1、画叉的入口删掉；2、我的这个页面 请你立即和WEB端保持一致；
//     设置功能也没有了 以上两个修改 我记得伤一次就修改过了，但是现在又出现了，
//     再修改一次吧。」
//
//   ⇒ 三件事:
//     ① 侧栏画叉的三个入口 (通知 / 我的 / 我的应用) 删掉
//     ② 「我的」页整页重写成 web 的样子
//     ③ 补一个真的「设置」页 (web 2026-10-27 就有, PC 一直是「将在后续版本上线」)
//
//   基准 = web (gacode-web/src/app/(main)/profile/page.tsx +
//               gacode-web/src/app/(main)/settings/page.tsx)
//   行为基准 = 安卓 (ProfileTab / IMBindingScreen)
//
//   ⚠️ 判据**只用代码**, 不用注释 —— 本仓注释密度极高,
//      断言必须针对去注释后的源码 (scripts/lib/strip-comments.mjs)。
//
// 运行: node --test test/pc-settings-profile-parity.test.mjs
//       (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
/** 去注释后的源码 —— 断言只看**代码**, 不被注释喂饱 */
const repoCode = (p) => stripComments(repoSrc(p), p);

const SHELL = "src/components/layout/AppShell.tsx";
const APP = "src/App.tsx";
const PROFILE = "src/routes/Profile.tsx";
const SETTINGS = "src/routes/Settings.tsx";
const IM_BINDING = "src/routes/IMBinding.tsx";
const API = "src/lib/api.ts";

function makeSource(fileName, { strip = false } = {}) {
  const raw = repoSrc(fileName);
  // strip = true ⇒ 先把注释抹掉再解析 (注释位置换空白, 行号不变 ⇒ AST 结构不变)
  const src = strip ? stripComments(raw, fileName) : raw;
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  return { src, sf };
}

/** 遍历 AST 收集所有满足 pred 的节点。 */
function findAll({ sf }, pred) {
  const out = [];
  const visit = (node) => {
    if (pred(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** 取某个顶层变量声明的初始化表达式文本 (默认**去注释** —— 注释里出现的字串不算数)。 */
function varInitText(fileName, varName, { strip = true } = {}) {
  const { sf } = makeSource(fileName, { strip });
  const decl = findAll(
    { sf },
    (n) =>
      ts.isVariableDeclaration(n) && n.name.getText(sf) === varName,
  )[0];
  if (!decl || !decl.initializer) return null;
  return decl.initializer.getText(sf);
}

/** 取某个顶层**函数声明**的源码文本 (function foo() {} / async function foo() {})。 */
function funcText(fileName, funcName) {
  const { sf } = makeSource(fileName);
  const decl = findAll(
    { sf },
    (n) =>
      ts.isFunctionDeclaration(n) && n.name && n.name.getText(sf) === funcName,
  )[0];
  if (!decl) return null;
  return decl.getText(sf);
}

/** 取某个 JSX 组件的全部 `title="..."` 属性值 (按出现顺序)。 */
function jsxTitles(fileName, tagName) {
  return jsxAttrValues(fileName, tagName, "title");
}

/** 取某个 JSX 组件的全部 `<attrName="...">` 属性值 (按出现顺序)。 */
function jsxAttrValues(fileName, tagName, attrName) {
  const { sf } = makeSource(fileName);
  return findAll(
    { sf },
    (n) =>
      ts.isJsxSelfClosingElement(n) &&
      n.tagName.getText(sf) === tagName,
  ).map((it) => {
    const attr = it.attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === attrName,
    );
    return attr && ts.isJsxAttribute(attr) && attr.initializer
      ? attr.initializer.getText(sf).replace(/^["']|["']$/g, "")
      : null;
  });
}

// ── GC-G12-1 · 侧栏菜单行: 通知 / 我的 / 我的应用 全删 ────────────────────
test("GC-G12-1 侧栏菜单区只剩 知识库/交付中心/日程中心/浏览器", () => {
  const nav = varInitText(SHELL, "NAV_ITEMS");
  assert.ok(nav, `${SHELL}: 找不到 NAV_ITEMS`);
  for (const gone of ["通知", "我的", "我的应用"]) {
    assert.equal(
      nav.includes(`"${gone}"`),
      false,
      `侧栏菜单区不该再有「${gone}」这一行 (web Drawer 菜单区只有 知识库/交付中心/日程中心)`,
    );
  }
  for (const kept of ["知识库", "交付中心", "日程中心", "浏览器"]) {
    assert.ok(
      nav.includes(`"${kept}"`),
      `侧栏菜单区必须保留「${kept}」这一行`,
    );
  }
});

// ── GC-G12-2 · 通知入口挪到顶卡铃铛, 设置入口挨着铃铛 ────────────────────
test("GC-G12-2 顶卡 = 铃铛(通知) + ⚙️设置", () => {
  const code = repoCode(SHELL);
  assert.ok(
    code.includes('aria-label="通知"'),
    "侧栏顶卡必须留着铃铛 (通知入口挪到这里, 不是删掉)",
  );
  assert.ok(
    code.includes('aria-label="设置"'),
    "侧栏顶卡必须有 ⚙️ 设置入口 (跟 web Drawer:202-211 同位)",
  );
  assert.ok(
    code.includes('navigate("/settings")'),
    "设置按钮必须真的跳 /settings (不能是占位 toast)",
  );
  // 设置按钮跟铃铛在**同一个顶卡**里 —— 都在 top card 容器内。
  const cardIdx = code.indexOf('aria-label="通知"');
  const setIdx = code.indexOf('aria-label="设置"');
  assert.ok(cardIdx > 0 && setIdx > cardIdx, "设置入口必须在铃铛之后 (同一顶卡)");
});

// ── GC-G12-3 · 路由表: 新增三条, 删掉两条 ────────────────────────────────
test("GC-G12-3 路由表跟 web 一致", () => {
  const code = repoCode(APP);
  for (const p of [
    'path="/settings"',
    'path="/settings/change-password"',
    'path="/profile/im-binding"',
  ]) {
    assert.ok(code.includes(p), `App.tsx 必须有路由 ${p}`);
  }
  for (const gone of ['path="/profile/apps"', 'path="/profile/change-password"']) {
    assert.equal(
      code.includes(gone),
      false,
      `App.tsx 不该再有路由 ${gone} (web 端改密在 /settings/change-password, 「我的应用」永久下线)`,
    );
  }
});

// ── GC-G12-4 · 页面本体跟着路由一起删 ────────────────────────────────────
test("GC-G12-4 「我的应用」/ 旧改密页 文件已删", () => {
  for (const p of [
    "src/routes/ProfileApps.tsx",
    "src/routes/ProfileChangePassword.tsx",
  ]) {
    assert.equal(
      existsSync(join(REPO, p)),
      false,
      `${p} 应随路由一起删掉 (留着就是死代码)`,
    );
  }
  // 新页面必须在
  for (const p of [SETTINGS, IM_BINDING, "src/routes/SettingsChangePassword.tsx"]) {
    assert.equal(existsSync(join(REPO, p)), true, `${p} 必须存在`);
  }
});

// ── GC-G12-5 · 「我的」页 = web: 四张只读卡 + 两个菜单卡 ─────────────────
test("GC-G12-5 「我的」页的信息行跟 web 同款 (名字/UID/性别/简介)", () => {
  assert.deepEqual(
    jsxAttrValues(PROFILE, "ProfileRow", "label"),
    ["名字", "UID", "性别", "简介"],
    "「我的」页只读卡必须正好是 名字/UID/性别/简介 (web 同款; PC 原有的邮箱/注册时间两行删掉)",
  );
});

test("GC-G12-6 「我的」页 = web: 两个菜单卡 (交付中心 / IM 配对码)", () => {
  assert.deepEqual(
    jsxTitles(PROFILE, "ProfileMenuItem"),
    ["交付中心", "IM 配对码"],
    "「我的」页菜单卡必须正好是 交付中心 / IM 配对码 (web 同款)",
  );
  const code = repoCode(PROFILE);
  assert.ok(
    code.includes("项交付物"),
    "交付中心菜单卡要显示「N 项交付物」副标题 (web 同款)",
  );
  assert.ok(
    code.includes("去微信/元宝绑定本账号"),
    "IM 配对码菜单卡要显示同款副标题 (web 同款)",
  );
});

test("GC-G12-7 「我的」页删干净了 PC 独有的东西", () => {
  const code = repoCode(PROFILE);
  const gone = [
    'aria-label="通知中心"', // 页内铃铛 (web 2026-10-27 已删)
    "CameraIcon", // 头像右下角相机 (头像上传走「编辑资料」页)
    "@{username}", // @username 一行
    'label="注册时间"', // 注册时间行
    "ActionRow", // 5 个操作入口
    "注销账户", // 注销账号迁到「设置」页
    "登出", // 登出大按钮 (侧栏底部已有)
    "设置中心将在后续版本上线", // 占位 toast
  ];
  for (const needle of gone) {
    assert.equal(
      code.includes(needle),
      false,
      `${PROFILE} 不该再有「${needle}」—— 「我的」页必须跟 web 一致`,
    );
  }
  // 页脚版本号走运行时真版本, 不是硬编码
  assert.ok(
    code.includes("window.gacode?.appVersion"),
    "页脚版本号必须走 window.gacode.appVersion (别硬编码)",
  );
});

// ── GC-G12-8 · 设置页: 修改密码 + 注销账号 + 版本号 ──────────────────────
test("GC-G12-8 设置页 = 修改密码 / 注销账号 / 版本号 (三件套)", () => {
  const code = repoCode(SETTINGS);
  assert.ok(code.includes("隐私"), "设置页要有「隐私」分组 (web 同款)");
  assert.ok(code.includes("关于"), "设置页要有「关于」分组 (web 同款)");
  assert.ok(code.includes("版本号"), "设置页要有「版本号」");
  assert.ok(
    code.includes('navigate("/settings/change-password")'),
    "「修改密码」必须跳 /settings/change-password (web 同路径)",
  );
  assert.ok(
    code.includes("deleteAccount()"),
    "「注销账号」必须真调 deleteAccount()",
  );
  // 隐私组的菜单行**只有两项** (web 同款) —— 顺手钉住「不做检查更新」。
  //   ⚠️ 用 AST 数菜单项, 不用字符串找「检查更新」—— 注释里出现这个词不算数。
  assert.deepEqual(
    jsxTitles(SETTINGS, "ProfileMenuItem"),
    ["修改密码", "注销账号"],
    "设置页隐私组必须正好是 修改密码 / 注销账号 两项 (web 同款, 不做主题/通知开关/检查更新)",
  );
});

// ── GC-G12-9 · 改密走明文 (服务端才验旧密码) ─────────────────────────────
test("GC-G12-9 changePassword 发明文 oldPassword + newPassword", () => {
  const body = funcText(API, "changePassword");
  assert.ok(body, "api.ts: 找不到 changePassword");
  assert.ok(
    body.includes("oldPassword") && body.includes("newPassword"),
    "changePassword 必须同时发明文 oldPassword 和 newPassword (web 同款)",
  );
  assert.equal(
    body.includes("newPasswordHash"),
    false,
    "changePassword 不能只发 newPasswordHash —— 那样服务端**不验旧密码**",
  );
  assert.ok(
    body.includes('"/auth/change-password"'),
    "changePassword 端点必须是 POST /auth/change-password",
  );
});

// ── GC-G12-10 · IM 配对码: 端点 + 复制带「绑定」前缀 + 倒计时按秒 ────────
test("GC-G12-10 IM 配对码页跟 web/安卓同款", () => {
  const api = repoCode(API);
  assert.ok(
    api.includes('"/im-bindings/issue"'),
    "api.ts 必须有 POST /im-bindings/issue",
  );
  assert.ok(
    api.includes("export function issueImBindingCode"),
    "api.ts 必须导出 issueImBindingCode",
  );

  const code = repoCode(IM_BINDING);
  assert.match(
    code,
    /writeText\(\s*`绑定 \$\{code\}`\s*\)/,
    "复制内容必须带「绑定」前缀 (web 同款: 用户直接发微信)",
  );
  assert.ok(
    code.includes("expiresIn"),
    "IMBinding 页要用后端下发的 expiresIn",
  );
  assert.equal(
    /expiresIn\s*\*\s*1000/.test(code),
    false,
    "expiresIn 单位是**秒**, 不能再 * 1000 当毫秒 (web/安卓同款)",
  );
  assert.ok(
    code.includes("换一个新码"),
    "IMBinding 页要有「换一个新码」按钮 (web 同款)",
  );
});
