"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/store/theme";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/Toast";

const IMMERSIVE_ROUTES = ["/ai-tool/image", "/ai-tool/video", "/admin", "/projects"];
const CANVAS_EDITOR_PREFIX = "/ai-tool/canvas/";
const NO_FOOTER_ROUTES = ["/assets", "/community"];

function isImmersiveRoute(pathname: string) {
  // Canvas editor sub-routes (e.g. /ai-tool/canvas/xxx) are immersive
  if (pathname.startsWith(CANVAS_EDITOR_PREFIX)) return true;
  return IMMERSIVE_ROUTES.some((route) => pathname.startsWith(route));
}

function hasFooter(pathname: string) {
  return !NO_FOOTER_ROUTES.some((route) => pathname.startsWith(route));
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);
  const showFooter = hasFooter(pathname);
  const isHome = pathname === "/";

  return (
    <ThemeProvider>
      <ToastProvider>
      <div className={cn("flex min-h-screen flex-col", immersive && "h-screen")}>
        {!immersive && !isHome && <Header />}
        <main
          className={cn(
            "flex flex-1 flex-col",
            immersive && "h-screen overflow-hidden"
          )}
        >
          {children}
        </main>
        {!immersive && !isHome && showFooter && <Footer />}
      </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
