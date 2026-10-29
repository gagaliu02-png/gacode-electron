/**
 * scripts/lib/source-scan.mjs
 *
 * 从 TS / TSX 源码里**精确**抠出某个函数 (或某个 const 箭头函数) 的代码块。
 *
 * ---------------------------------------------------------------------------
 * 为什么不用正则抠函数体
 * ---------------------------------------------------------------------------
 *   朴素的 `code.match(/function Foo\([\s\S]*?\n\}/)` 会在**参数解构的右花括号**处
 *   提前截断 —— 例如:
 *
 *     function FileEventBubble({
 *       url,
 *       showDownload = true,
 *     }: RichEventBubbleProps) {
 *       ...
 *     }
 *
 *   `}: RichEventBubbleProps) {` 这一行的行首就是 `}` ⇒ `\n\}` 命中, 函数体被切成
 *   92 个字符的碎片 —— 后面的断言全在碎片上跑, 等于没断言。
 *
 *   这里走 TypeScript 的 AST: 按节点取真实边界, 不会误截。
 *   (typescript 本来就是 devDependency —— scripts/lib/strip-comments.mjs 在用。)
 *
 * ---------------------------------------------------------------------------
 * 抄自 web 定稿版 (`78b01cb:scripts/lib/source-scan.mjs`), 实现逐字相同 ——
 *   断言的「有效性」判据必须三端一致, 否则 web 的变异反证台在 PC 上跑不起来。
 *
 * 用法:
 *   import { extractFunction } from "./lib/source-scan.mjs";
 *   const fn = extractFunction(stripComments(src, path), "FileEventBubble");
 *   assert.ok(fn && /NO_PUBLIC_LINK/.test(fn), "...");
 */
import ts from "typescript";

/**
 * 抠出函数体 —— 支持三种形态:
 *   ① `function Foo(...) { ... }`
 *   ② `const Foo = (...) => { ... }` / `const Foo = async () => { ... }`
 *   ③ `const Foo = useCallback((...) => { ... }, [deps])` (React Hook)
 *
 * ② ③ 两种 const 形态返回的是**整条变量声明** (`const Foo = ...`),
 * 里面含函数体 —— 断言只关心「这段代码里有没有某个写法」, 前缀无影响。
 *
 * @param src 源码文本 (建议先 stripComments 过)
 * @param name 函数名
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @returns 函数的完整源码文本; 找不到 ⇒ null
 */
export function extractFunction(src, name, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let found = null;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.text === name
    ) {
      found = node;
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === name && node.initializer) {
        const init = node.initializer;
        if (
          ts.isArrowFunction(init) ||
          ts.isFunctionExpression(init) ||
          ts.isCallExpression(init)
        ) {
          found = node;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!found) return null;
  return src.slice(found.getStart(sf), found.end);
}

/**
 * 抠出某个 `if` 分支的代码块 —— 用**判据文本**定位。
 *
 * 用途: 断言「这个 if 分支里有没有做某件事」时, 用正则切
 * (`/if \(X\)[\s\S]{0,400}Y/`) 会被两个坑坑掉:
 *   · 窗口大小是拍的 —— 目标写法在窗口外就**静默放过** (假绿);
 *   · 下一个同名写法也在窗口内就**误判** (假红)。
 *
 * 这里走 AST: 找到判据文本匹配的 IfStatement, 返回它 consequent 分支的真实文本。
 *
 * @param src 源码文本 (建议先 stripComments 过)
 * @param condText 判据里出现的关键字片段 (如 `apiErrorStatus(err) === 409`)
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @returns 分支代码文本; 找不到 ⇒ null
 */
export function extractIfBranch(src, condText, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isIfStatement(node)) {
      // ⚠️ TS 5.0 起 `IfStatement.condition` 改名 `IfStatement.expression` (5.9 已删前者)
      //   —— 两个名字都试一遍, 免得换 TS 版本就炸。
      const condNode = node.expression ?? node.condition;
      if (!condNode) return;
      const cond = src.slice(condNode.getStart(sf), condNode.end);
      if (cond.includes(condText) && node.thenStatement) {
        found = node.thenStatement;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!found) return null;
  return src.slice(found.getStart(sf), found.end);
}

/**
 * 抠出 JSX 元素上某个属性的源码文本 (如 `onAction={...}`)。
 *
 * 用途: 断言「这个回调里有没有做某件事」。
 * 正则切 JSX 属性会在嵌套花括号处截断 —— AST 才切得准。
 *
 * @param src 源码文本 (建议先 stripComments 过)
 * @param propName 属性名 (如 "onAction")
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @returns 属性值文本 (不含属性名); 找不到 ⇒ null
 */
export function extractJsxProp(src, propName, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isJsxAttribute(node) && node.name.text === propName && node.initializer) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!found) return null;
  return src.slice(found.getStart(sf), found.end);
}

/**
 * 抠出某个 `catch` 子句的代码块 —— 用**判据文本**定位所在的 try。
 *
 * 用途: 断言「catch 里做了降级处理」时, 用正则扫整个函数会误判 ——
 *   函数里 catch **之后**还有别的 `return null` (例如「拿到空载荷 ⇒ 降级」),
 *   `/catch[\s\S]*?return null/` 会把那个也当成 catch 里的 ⇒ 假绿。
 *
 * 这里走 AST: 找到 catch 子句里含判据文本的 try, 返回该 catch 子句的真实文本。
 *
 * @param src 源码文本 (建议先 stripComments 过)
 * @param markerText catch 子句里出现的判据片段 (如 "[stream-state]")
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @returns catch 子句代码文本; 找不到 ⇒ null
 */
export function extractCatchBlock(src, markerText, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isTryStatement(node) && node.catchClause) {
      const text = src.slice(node.catchClause.getStart(sf), node.catchClause.end);
      if (text.includes(markerText)) {
        found = node.catchClause;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!found) return null;
  return src.slice(found.getStart(sf), found.end);
}

/**
 * 抠出对象字面量里某个属性 (箭头函数 / 方法) 的源码文本。
 *
 * 用途: 宿主层把回调写在 `createEntryController(..., { onLocalRecord: (rec) => {...} })`
 *   这种**对象属性**里 —— 它们**不是命名声明** ⇒ `extractFunction` 抠不到
 *   ⇒ 这里按属性抠 (返回 `name: <value>` 的整段文本, 可以直接塞回对象字面量里)。
 *
 * @param src 源码文本 (建议先 stripComments 过)
 * @param propName 属性名
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @param opts { nth = 0, from = 0 } —— nth = 第几个同名属性; from = 只找这个位置之后的
 * @returns 该属性的源码文本; 找不到 ⇒ null
 */
export function extractObjectProp(src, propName, fileName = "mod.ts", opts = {}) {
  const { nth = 0, from = 0 } = opts || {};
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const hits = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === propName &&
      node.getStart(sf) >= from
    ) {
      hits.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  const hit = hits[nth];
  if (!hit) return null;
  return src.slice(hit.getStart(sf), hit.end);
}

/**
 * 抠出「**同一个对象字面量里**」的另一个属性 —— 用「先找到锚点属性, 再在锚点所在的
 * 那一个对象字面量里找目标属性」的方式定位 (不许靠出现顺序猜)。
 *
 * 用途: 宿主的进场回调 `onLocalRecord` / `onDegrade` 在**同一个**对象字面量里
 *   (`createEntryController(..., { onLocalRecord, onDegrade })`),
 *   而同一个文件里有**两处** createEntryController (进场那处 + 发送那处,
 *   发送那处**没有** onLocalRecord) ⇒ 抠 `onDegrade` 时必须跟锚点落在同一处。
 *
 * @param src 源码文本
 * @param anchorProp 作为锚点的属性名 (应当唯一)
 * @param propName 要抠的属性名
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析)
 * @returns 属性源码文本; 找不到 ⇒ null
 */
export function extractSiblingObjectProp(
  src,
  anchorProp,
  propName,
  fileName = "mod.ts"
) {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let anchorObj = null;
  const visit = (node) => {
    if (anchorObj) return;
    if (
      ts.isPropertyAssignment(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === anchorProp &&
      node.parent &&
      ts.isObjectLiteralExpression(node.parent)
    ) {
      anchorObj = node.parent;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  if (!anchorObj) return null;

  for (const prop of anchorObj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return src.slice(prop.getStart(sf), prop.end);
    }
  }
  return null;
}

/**
 * 抠出任意**命名声明**的源码文本 (函数 / const / interface / type)。
 * 找不到 ⇒ null。
 */
export function extractDecl(src, name, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  let found = null;
  const visit = (node) => {
    if (found) return;
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      node.name.text === name
    ) {
      found = node;
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) {
          found = node;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!found) return null;
  return src.slice(found.getStart(sf), found.end);
}
