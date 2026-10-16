/**
 * routes/ChatList.tsx — 阶段 1 对话列表 (空态)
 *
 * 阶段 2 才接真 API. 这里给一个干净的空态 + "新建对话"占位按钮.
 */

import { useNavigate } from "react-router-dom";

export function ChatList() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full flex flex-col">
      <div className="px-6 pt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => navigate("/chat/new")}
          className="rounded-md bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 px-4 py-2 text-sm font-medium"
        >
          新建对话
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="text-center max-w-sm">
          <p className="text-base font-medium text-fg">暂无对话</p>
          <p className="text-sm text-fg-muted mt-2">
            在右上角点击"新建对话"开始第一次会话,或者从首页的快速开始输入框进入。
          </p>
          <p className="text-xs text-fg-subtle mt-4 font-mono">
            阶段 2 接 /yinian/sessions GET + POST
          </p>
        </div>
      </div>
    </div>
  );
}