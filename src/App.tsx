import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "./routes/Home";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Electron 本地 React 渲染,网络都走本地 / 远程 API,
      // 默认走 gacode-web 的 retry 行为即可,不特别调。
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}