import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle dark/light mode"
      style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(128,128,128,.25)", background: "transparent", color: "inherit", cursor: "pointer" }}
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );
}

export default {
  logo: <strong style={{ fontWeight: 800, letterSpacing: "-0.02em" }}>wtrdb</strong>,
  logoLink: "/",
  docsRepositoryBase: "https://github.com/SftwtrAI/WtrDB/tree/openclaw_wtrdb/apps/docs",
  useNextSeoProps() {
    return { titleTemplate: "%s – wtrdb docs" };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="wtrdb documentation" />
      <meta property="og:description" content="Governed knowledge graphs, federation, and Brain Endpoint integrations." />
    </>
  ),
  primaryHue: 210,
  primarySaturation: 80,
  darkMode: true,
  nextThemes: { defaultTheme: "dark" },
  navbar: { extraContent: <ThemeToggle /> },
  sidebar: { defaultMenuCollapseLevel: 1, toggleButton: true },
  toc: { float: true, title: "On this page" },
  editLink: { component: () => null },
  feedback: { content: null },
  footer: { text: <span>© {new Date().getFullYear()} wtrdb</span> }
};
