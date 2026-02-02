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
      <div className="theme-toggle w-10 h-10 rounded-full bg-bg-tertiary border border-border-default"></div>
    );
  }

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? <IconMoon className="w-6 h-6" /> : <IconSun className="w-6 h-6" />}
    </button>
  );
}