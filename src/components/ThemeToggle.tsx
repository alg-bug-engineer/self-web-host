"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./providers/theme-provider";
import IconMoon from "./icons/IconMoon";
import IconSun from "./icons/IconSun";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render a placeholder or null on the server to avoid hydration mismatch
    return (
      <div className="theme-toggle h-10 w-10 border border-border-default bg-bg-tertiary"></div>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
      title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
    >
      {theme === "light" ? <IconMoon className="w-6 h-6" /> : <IconSun className="w-6 h-6" />}
    </button>
  );
}
