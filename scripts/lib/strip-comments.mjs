/**
 * scripts/lib/strip-comments.mjs
 *
 * 把 TS / TSX 源码里的**注释**抹掉 (保留等长空白 + 换行, 行号不变)。
 *
 * ---------------------------------------------------------------------------
 * 为什么需要它 (任务书 04 的硬要求)
 * ---------------------------------------------------------------------------
 *   断言脚本要证明「**代码**里有某个写法」。但源码里同一个写法常常**先出现在注释里**
 *   —— 本仓的注释密度很高 (契约条款、踩坑记录、事故复盘都写在注释里)。
 *   直接对整份源码做 `includes(...)` / 正则匹配 ⇒ 断言会被注释喂饱:
 *   把真正的代码改坏, 断言照样绿 —— 这种断言等于没有断言。
 *
 *   所以: 结构类断言必须针对**去注释后的源码**。
 *
 * ---------------------------------------------------------------------------
 * 为什么用 TS 编译器而不是正则
 * ---------------------------------------------------------------------------
 *   正则去注释会误伤**字符串里的 `//`** (比如 "https://api.example.com") 和
 *   字符串里的 `/*` —— 抹掉它们会把后面的真代码一起吃掉。
 *   这里走 `typescript` 的 AST: 逐个节点取 leading / trailing comment ranges,
 *   只抹**真注释**。typescript 本来就是 devDependency (scripts/lib/schedule-loader.mjs
 *   在用), 不新增依赖。
 *
 *   JSX 里的花括号注释 (JSXExpressionContainer 里的空表达式) 也算注释,
 *   一并抹掉 —— 否则 React 组件文件里的说明性注释照样会喂饱断言。
 *
 * ---------------------------------------------------------------------------
 * 抄自 web 定稿版 (`78b01cb:scripts/lib/strip-comments.mjs`), 实现逐字相同 ——
 *   断言的「有效性」判据必须三端一致, 否则 web 的变异反证台在 PC 上跑不起来。
 *
 * 用法:
 *   import { stripComments } from "./lib/strip-comments.mjs";
 *   const code = stripComments(repoSrc("src/lib/sse.ts"));
 *   assert.ok(/readChatSse\(/.test(code), ...);
 */
import ts from "typescript";

/**
 * 去掉注释, 返回等长字符串 (注释位置换成空格, 换行保留 ⇒ 行号不变)。
 *
 * @param src 源码文本
 * @param fileName 只用于决定解析模式 (.tsx 走 TSX 解析, 其它走 TS 解析)
 */
export function stripComments(src, fileName = "mod.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const ranges = [];
  const collect = (pos, end) => {
    for (const r of ts.getLeadingCommentRanges(src, pos) ?? []) ranges.push(r);
    for (const r of ts.getTrailingCommentRanges(src, end) ?? []) ranges.push(r);
  };
  // 根节点自己先收一遍 (文件最开头的文件级注释), 再下探每个子节点。
  collect(sf.pos, sf.end);
  const visit = (node) => {
    collect(node.pos, node.end);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (ranges.length === 0) return src;

  // 去重 + 排序 (同一个注释可能被根节点和子节点各收一次)
  const uniq = [...new Map(ranges.map((r) => [r.pos, r])).values()].sort(
    (a, b) => a.pos - b.pos
  );

  const out = src.split("");
  for (const r of uniq) {
    for (let i = r.pos; i < r.end && i < out.length; i++) {
      // 换行保留, 其余抹成空格 —— 行号与列宽都不变
      if (out[i] !== "\n" && out[i] !== "\r") out[i] = " ";
    }
  }
  return out.join("");
}
