#!/usr/bin/env node
/**
 * verify-pagination-guard.mjs — 分页「二次累加」guard 回归断言 (2026-10-27)
 * ---------------------------------------------------------------------------
 * 原件端: web `scripts/verify-pagination-guard.mjs` (WEB端PM 2026-10-27 随分页修复新增)
 * 本文件 = 抄 web + 按 PC 端实际命名参数化 (组件意识: 抄不重写)
 *
 * 根因:
 *   交付中心页 + 知识库列表页都用 `placeholderData: (prev) => prev` — 点「加载更多」
 *   时 queryKey 变化, react-query 把上一页的 data 引用原样回填给新 queryKey.
 *   累积 effect 原本只看依赖 [pageData, page]:
 *     - 没有 isFetching 守卫 (placeholderData 回填期间也会跑)
 *     - 没有「已消费引用」判重
 *   ⇒ page 1→2 时 pageData 仍是第 1 页那份 ⇒ effect 重跑 ⇒ 走 page !== 1 分支
 *     ⇒ 第 1 页 items 被追加第二次 (列表 = 第1页 + 第1页 + 第2页, 出现重复卡片).
 *
 * 本脚本用 TS AST (ts.createSourceFile) 静态检查两页的守卫**代码形状**:
 *   1. 声明了 consumedDataRef (useRef(...))
 *   2. 累积 effect 里有 `if (isFetching) return;` 守卫
 *   3. 累积 effect 里有已消费引用判重 (consumedDataRef.current === <dataVar>)
 *   4. 累积 effect 的依赖数组含 isFetching
 *   5. 每一处 setItems([]) 所在的作用域里都有 consumedDataRef.current = null 重置
 *      (漏了重置 = 清空后空白列表 — 这个 bug 的另一半)
 *   6. 库页原有的选中 id 过滤逻辑仍在 (没被删掉)
 *   7. consumedDataRef 的类型标注用的是该文件实际 import 的 API 函数
 *
 * ⚠️ 本脚本是**静态代码形状**检查, 不是运行时行为复现.
 *    「点加载更多不再出现重复卡片」需要真机实测, 本脚本证明不了.
 *
 * ⚠️ PC 与 web 的命名差异 (参数化原因, 别照抄 web 的字面量):
 *   - 数据变量: web 两页都叫 `pageData`; PC 交付中心叫 `pageData`, 知识库叫 `data`
 *   - 列表 API: web 库页是 `listLibraryMapped`; PC 库页是 `listLibrary`
 *   - 选中 id 过滤: web 在累积 effect 内按 `pageData` 过滤;
 *                   PC 按**累积后的 items** 过滤 (L-25 收尾: 用当前页会把第 1 页选中清掉)
 *
 * 用法: node scripts/verify-pagination-guard.mjs
 * 退出码: 0 = 全绿, 1 = 有断言失败.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  {
    label: "deliveries",
    rel: "src/routes/Deliveries.tsx",
    apiFn: "listDeliverables",
    dataVar: "pageData",
    expectsSelectedIds: false,
  },
  {
    label: "library",
    rel: "src/routes/Library.tsx",
    apiFn: "listLibrary",
    dataVar: "data",
    expectsSelectedIds: true,
  },
];

/* ------------------------------------------------------------------ *
 * AST helpers
 * ------------------------------------------------------------------ */

function walk(node, fn) {
  if (!node) return;
  fn(node);
  node.forEachChild((child) => walk(child, fn));
}

/** 只看当前作用域 —— 不下钻嵌套函数 (否则外层组件会被误判成「清空点」). */
function walkShallow(node, fn) {
  if (!node) return;
  fn(node);
  node.forEachChild((child) => {
    if (isFunctionLike(child)) return;
    walkShallow(child, fn);
  });
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function isCallNamed(node, name) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  );
}

/** setItems([]) — 清空列表的点 */
function isClearItemsCall(node) {
  if (!isCallNamed(node, "setItems")) return false;
  const arg = node.arguments[0];
  return !!arg && ts.isArrayLiteralExpression(arg) && arg.elements.length === 0;
}

/** setItems(<非空表达式>) — 累积 effect 的入列点 */
function isAccumulateItemsCall(node) {
  if (!isCallNamed(node, "setItems")) return false;
  const arg = node.arguments[0];
  if (!arg) return false;
  if (ts.isArrayLiteralExpression(arg)) return arg.elements.length > 0;
  return true;
}

function findUseEffects(sf) {
  const out = [];
  walk(sf, (node) => {
    if (isCallNamed(node, "useEffect")) out.push(node);
  });
  return out;
}

function effectParts(call) {
  const cb = call.arguments[0];
  const deps = call.arguments[1];
  return {
    cb:
      cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? cb : null,
    deps: deps && ts.isArrayLiteralExpression(deps) ? deps : null,
  };
}

/** 把 useEffect 分成「累积 effect」和「清空 effect」两类. */
function classifyEffects(sf) {
  const accumulates = [];
  const clears = [];
  for (const call of findUseEffects(sf)) {
    const { cb, deps } = effectParts(call);
    if (!cb) continue;
    let hasClear = false;
    let hasAccum = false;
    walk(cb, (node) => {
      if (isClearItemsCall(node)) hasClear = true;
      if (isAccumulateItemsCall(node)) hasAccum = true;
    });
    if (hasAccum) accumulates.push({ call, cb, deps });
    else if (hasClear) clears.push({ call, cb, deps });
  }
  return { accumulates, clears };
}

/** `if (isFetching) return;` */
function hasFetchingGuard(cb) {
  let ok = false;
  walk(cb, (node) => {
    if (!ts.isIfStatement(node)) return;
    if (node.expression.getText().replace(/\s+/g, "") !== "isFetching") return;
    const then = node.thenStatement;
    if (ts.isBlock(then)) {
      const stmts = then.statements;
      ok = stmts.length > 0 && ts.isReturnStatement(stmts[0]) && !stmts[0].expression;
    } else if (ts.isReturnStatement(then)) {
      ok = !then.expression;
    }
  });
  return ok;
}

/**
 * `if (consumedDataRef.current === <dataVar>) return;`
 *
 * ⚠️ 必须是 **if 的直接条件** + **裸 return** —— 只找「任意位置出现了那个比较表达式」是不够的:
 *    `if (consumedDataRef.current === <dataVar> && false) return;` 会把去重逻辑**废掉**,
 *    但比较表达式仍在 ⇒ 形状级检查会放过去（PM 2026-10-27 实测变异打穿，已修）。
 */
function hasConsumedDedupe(cb, dataVar) {
  let ok = false;
  walk(cb, (node) => {
    if (!ts.isIfStatement(node)) return;
    const cond = node.expression;
    // 条件必须 **恰好** 是那个比较表达式（不能被 `&&` / `||` 包裹后失效）
    if (!ts.isBinaryExpression(cond)) return;
    if (cond.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return;
    const left = cond.left;
    if (!ts.isPropertyAccessExpression(left)) return;
    if (!ts.isIdentifier(left.expression)) return;
    if (left.expression.text !== "consumedDataRef") return;
    if (left.name.text !== "current") return;
    const right = cond.right;
    if (!ts.isIdentifier(right) || right.text !== dataVar) return;
    // then 分支必须是裸 return（无返回值）
    const then = node.thenStatement;
    let good = false;
    if (ts.isBlock(then)) {
      const stmts = then.statements;
      good = stmts.length > 0 && ts.isReturnStatement(stmts[0]) && !stmts[0].expression;
    } else if (ts.isReturnStatement(then)) {
      good = !then.expression;
    }
    ok = ok || good;
  });
  return ok;
}

function depsInclude(deps, name) {
  if (!deps) return false;
  return deps.elements.some((el) => ts.isIdentifier(el) && el.text === name);
}

/** `consumedDataRef.current = null;` (当前作用域内) */
function hasResetAssignment(scope) {
  let ok = false;
  walkShallow(scope, (node) => {
    if (!ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    const left = node.left;
    if (!ts.isPropertyAccessExpression(left)) return;
    if (!ts.isIdentifier(left.expression)) return;
    if (left.expression.text !== "consumedDataRef") return;
    if (left.name.text !== "current") return;
    if (node.right.kind === ts.SyntaxKind.NullKeyword) ok = true;
  });
  return ok;
}

/** 所有直接调用 setItems([]) 的作用域 (清空点). */
function findClearScopes(sf) {
  const scopes = [];
  walk(sf, (node) => {
    if (!isFunctionLike(node)) return;
    let has = false;
    walkShallow(node, (child) => {
      if (isClearItemsCall(child)) has = true;
    });
    if (has) scopes.push(node);
  });
  return scopes;
}

function findRefDecl(sf, name) {
  let found = null;
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== name) return;
    const init = node.initializer;
    if (!init || !ts.isCallExpression(init)) return;
    if (!ts.isIdentifier(init.expression) || init.expression.text !== "useRef")
      return;
    found = node;
  });
  return found;
}

/**
 * 库页的「选中 id 过滤」逻辑仍在.
 *
 * ⚠️ PC 与 web 的实现位置不同:
 *   - web: 在累积 effect 内, 回调按 `pageData` 过滤
 *   - PC: 独立 effect —— `items` 引用在**外层 effect 作用域**
 *     (const nextIds = new Set(items.map(...))), 回调内只引用 nextIds/cur
 *     (L-25 收尾: PC 列表是累积的, 用当前页会把第 1 页的选中清掉)
 * ⇒ 这里按「含 setSelectedIds 调用的作用域里引用了 filterVar」判定,
 *   且回调体内也允许直接引用 —— 与实现位置解耦.
 */
function hasSelectedIdsFilter(sf, filterVar) {
  let ok = false;
  const visit = (node, scopeStack) => {
    if (ok) return;
    const stack = isFunctionLike(node) ? [...scopeStack, node] : scopeStack;
    if (isCallNamed(node, "setSelectedIds")) {
      const arg = node.arguments[0];
      if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
        // 回调体内直接引用
        walk(arg.body, (inner) => {
          if (ts.isIdentifier(inner) && inner.text === filterVar) ok = true;
        });
        // 或所在作用域内引用 (PC 的写法: items 在 effect 作用域, 不在回调内)
        const scope = stack[stack.length - 1];
        if (scope) {
          walkShallow(scope, (inner) => {
            if (ts.isIdentifier(inner) && inner.text === filterVar) ok = true;
          });
        }
      }
    }
    node.forEachChild((child) => visit(child, stack));
  };
  visit(sf, []);
  return ok;
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

const results = [];
let skipped = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || "" });
}

for (const target of TARGETS) {
  const p = `check:${target.label}`;
  const file = path.join(ROOT, ...target.rel.split("/"));

  if (!fs.existsSync(file)) {
    check(`${p}/0-file-exists`, false, `missing ${target.rel}`);
    continue;
  }

  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  // 1. consumedDataRef 声明 (useRef)
  const refDecl = findRefDecl(sf, "consumedDataRef");
  check(
    `${p}/1-consumedDataRef-decl`,
    !!refDecl,
    refDecl ? "useRef(...)" : "no useRef() declaration named consumedDataRef"
  );

  // 7. ref 类型标注用的是本文件实际的 API 函数
  //    (类型写在 useRef<T>(...) 的泛型实参上, 不是变量声明的类型标注上)
  let typeText = "";
  if (refDecl) {
    const generic = refDecl.initializer.typeArguments
      ? refDecl.initializer.typeArguments[0]
      : undefined;
    typeText = generic
      ? generic.getText()
      : refDecl.type
        ? refDecl.type.getText()
        : "";
  }
  check(
    `${p}/7-ref-type-api-fn`,
    typeText.includes(target.apiFn),
    `type=${typeText || "(none)"} expected=${target.apiFn}`
  );

  const { accumulates } = classifyEffects(sf);
  const acc = accumulates[0];
  check(
    `${p}/0-accumulation-effect-found`,
    !!acc,
    `accumulation-effects=${accumulates.length}`
  );

  // 2. isFetching 守卫
  check(
    `${p}/2-isFetching-guard`,
    !!acc && hasFetchingGuard(acc.cb),
    "if (isFetching) return;"
  );

  // 3. 已消费引用判重
  check(
    `${p}/3-consumed-ref-dedupe`,
    !!acc && hasConsumedDedupe(acc.cb, target.dataVar),
    `consumedDataRef.current === ${target.dataVar}`
  );

  // 4. 依赖数组含 isFetching
  check(
    `${p}/4-deps-include-isFetching`,
    !!acc && depsInclude(acc.deps, "isFetching"),
    "deps=[data/pageData, page, isFetching]"
  );

  // 5. 每个 setItems([]) 作用域都要重置守卫 (漏了 ⇒ 清空后空白列表)
  const clearScopes = findClearScopes(sf);
  const missingReset = clearScopes.filter((scope) => !hasResetAssignment(scope));
  check(
    `${p}/5-reset-on-every-clear`,
    missingReset.length === 0,
    `clear-scopes=${clearScopes.length} missing-reset=${missingReset.length}`
  );

  // 6. 库页原有的选中 id 过滤逻辑仍在
  if (target.expectsSelectedIds) {
    check(
      `${p}/6-setSelectedIds-kept`,
      hasSelectedIdsFilter(sf, "items"),
      "setSelectedIds(<filter over items>) still present"
    );
  } else {
    skipped += 0; // 交付中心页本来就没有多选逻辑 —— 不算「跳过」
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`PASS  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
}
console.log(
  `\nchecked=${results.length} passed=${results.length - failed} failed=${failed} skipped=${skipped}`
);
process.exit(failed > 0 ? 1 : 0);
