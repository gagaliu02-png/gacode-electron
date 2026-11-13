/**
 * routes/ClientTools.tsx — 「端侧执行」页
 *
 * [2026-11-12 · P4/P7] gaga 拍板：**PC 端这一整套工具**从设置页**挪出来**，
 * 放到**抽屉里「浏览器」下面**，点进来就是这一整页。
 *
 * ## 这一页装什么
 *
 *   ① 「我的电脑」—— 在不在线（设备通道 D4）· 正在跑什么 · 停掉哪一个
 *      （端侧执行卡：总开关 / 一键急停 / 执行记录）
 *   ② 「本机定时」—— 只在 Gacode 开着时跑（不写 Windows 计划任务）
 *
 * ## 为什么从设置页挪走
 *
 * 设置页是「隐私 / 关于」那种低频页；端侧执行是**这台电脑能不能被 AI 动手**的开关 ——
 * 用户要能**一眼看到、一键关掉** ⇒ 值得占一个抽屉入口，而不是藏在设置里第二屏。
 *
 * ⚠️ 顶栏标题走 AppShell.resolveTitle()（pathname === "/client-tools" ⇒ "端侧执行"），
 *    本页**不自己画顶栏**（跟其它路由统一）。
 */

import { ClientToolsCard } from "../components/client-tools/ClientToolsCard";
import { LocalTasksCard } from "../components/client-tools/LocalTasksCard";

export function ClientTools() {
  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        <ClientToolsCard />
        <LocalTasksCard />
      </div>
    </div>
  );
}
