/**
 * Reactive viewport size hook + responsive design tokens.
 *
 * Breakpoints align with Tailwind defaults:
 *   mobile  < 768  (md)
 *   tablet  < 1024 (lg)
 *   desktop ≥ 1024
 *
 * Consumers read `isMobile` / `isTablet` and gate layout decisions on it.
 * The hook is cheap (one resize listener per mounted component); subtree
 * sharing is encouraged via prop drilling rather than context to keep the
 * code grep-friendly.
 *
 * Also writes `--app-vh` on the documentElement so CSS can use real-pixel
 * viewport height (iOS Safari's 100vh excludes the URL bar).
 */
import { useEffect, useState } from "react";

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
}

const MOBILE_MAX = 767;
const TABLET_MAX = 1023;

function compute(): Viewport {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900, isMobile: false, isTablet: false, isDesktop: true, isTouch: false };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMobile = w <= MOBILE_MAX;
  const isTablet = w > MOBILE_MAX && w <= TABLET_MAX;
  return {
    width: w,
    height: h,
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    isTouch: matchMedia("(pointer: coarse)").matches,
  };
}

function syncAppVh() {
  if (typeof window === "undefined") return;
  // 1% of viewport height — multiply by 100 in CSS for full height.
  document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
}

export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(() => {
    syncAppVh();
    return compute();
  });

  useEffect(() => {
    const onResize = () => {
      syncAppVh();
      setV(compute());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return v;
}
