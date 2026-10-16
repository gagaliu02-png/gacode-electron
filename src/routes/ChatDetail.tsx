/**
 * routes/ChatDetail.tsx — 阶段 1 对话详情 (空态)
 *
 * 从 URL 参数拿 :id 显示, 提示用户选择对话或新建.
 */

import { useParams } from "react-router-dom";

export function ChatDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="text-center max-w-sm">
        <p className="text-base font-medium text-fg">对话详情</p>
        <p className="text-sm text-fg-muted mt-2">
          {id ? (
            <>
              当前会话 id = <span className="font-mono text-fg">{id}</span>
              <br />
              <span className="text-fg-subtle text-xs">(阶段 1 不接真 API)</span>
            </>
          ) : (
            "选个对话开始"
          )}
        </p>
        <p className="text-xs text-fg-subtle mt-4 font-mono">
          阶段 2 接 /yinian/sessions/:id/messages + SSE
        </p>
      </div>
    </div>
  );
}