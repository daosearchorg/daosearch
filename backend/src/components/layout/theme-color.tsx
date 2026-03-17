"use client";

import { useTheme } from "next-themes";

const THEME_COLORS: Record<string, string> = {
  light: "#ffffff",
  dark: "#000000",
  "quiet": "#3C3C3C",
  "paper": "#F4F0E8",
  "calm": "#EDE6D8",
  "focus": "#FAF8F2",
};

export function ThemeColor() {
  const { theme } = useTheme();
  const color = THEME_COLORS[theme || "light"] || THEME_COLORS.light;
  return <meta name="theme-color" content={color} />;
}
