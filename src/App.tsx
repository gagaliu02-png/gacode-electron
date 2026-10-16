import { useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { AppShell } from "./components/layout/AppShell";
import { Login } from "./routes/Login";
import { Register } from "./routes/Register";
import { Home } from "./routes/Home";
import { ChatList } from "./routes/ChatList";
import { ChatDetail } from "./routes/ChatDetail";
import { Library } from "./routes/Library";
import { Deliveries } from "./routes/Deliveries";
import { Notifications } from "./routes/Notifications";
import { Profile } from "./routes/Profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * AuthClearListener — 监听 api.ts 在 refresh 失败时 dispatch 的"未授权"
 * 事件, 主动 toast + 跳 /login. 之所以单独抽一个组件, 是为了拿到
 * useNavigate + useToast hooks (hook 不能在 AuthProvider 内部乱调).
 */
function AuthClearListener() {
  const navigate = useNavigate();
  const { toast } = useToast();
  useEffect(() => {
    const onClear = () => {
      toast({ message: "会话已过期,请重新登录", variant: "danger" });
      navigate("/login", { replace: true });
    };
    window.addEventListener("gacode:auth-cleared", onClear);
    return () => window.removeEventListener("gacode:auth-cleared", onClear);
  }, [navigate, toast]);
  return null;
}

/**
 * Protected — 包裹需登录才能访问的路由.
 * - loading 时显示一个占位 (跟 login 同一底色, 避免闪烁)
 * - 未登录 → 跳 /login
 * - 已登录 → 渲染 AppShell (持久 sidebar) + children
 */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-bg-base" aria-label="加载中" />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

export function App() {
  return (
    /*
     * 用 HashRouter 而不是 BrowserRouter — file:// 加载 + BrowserRouter 会触发
     * history.replaceState, 把文档 URL 改成 file:///D:/, 让 <script type="module"
     * src="./assets/..."> 在 fetch 时被 re-resolve 到错的 base URL, 渲染层
     * 起不来. HashRouter 只动 location.hash, 不动 pathname, 安全.
     *
     * 代价: URL 显示 file:///.../#/chat/123 这种带 # 的样子, Electron 本地应用
     * 不暴露地址栏, 不影响用户感知; 阶段 2 接 deep link 时再用 custom protocol
     * 把 file:// 升级到 app://, 切回 BrowserRouter.
     */
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            <AuthClearListener />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <Protected>
                    <Home />
                  </Protected>
                }
              />
              <Route
                path="/chat"
                element={
                  <Protected>
                    <ChatList />
                  </Protected>
                }
              />
              <Route
                path="/chat/:id"
                element={
                  <Protected>
                    <ChatDetail />
                  </Protected>
                }
              />
              <Route
                path="/library"
                element={
                  <Protected>
                    <Library />
                  </Protected>
                }
              />
              <Route
                path="/deliveries"
                element={
                  <Protected>
                    <Deliveries />
                  </Protected>
                }
              />
              <Route
                path="/notifications"
                element={
                  <Protected>
                    <Notifications />
                  </Protected>
                }
              />
              <Route
                path="/profile"
                element={
                  <Protected>
                    <Profile />
                  </Protected>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}