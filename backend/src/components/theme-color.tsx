"use client";

import { useTheme } from "next-themes";

const COLORS = {
  light: "#ffffff",
  dark: "#333333",
};

export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  const color = resolvedTheme === "dark" ? COLORS.dark : COLORS.light;

  return <meta name="theme-color" content={color} />;
}
