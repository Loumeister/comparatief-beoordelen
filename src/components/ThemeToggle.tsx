import { useEffect, useState } from "react";

export const ThemeToggle = () => {
  const [designMode, setDesignMode] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("design-mode", designMode);
  }, [designMode]);

  return (
    <button
      onClick={() => setDesignMode(!designMode)}
      className="fixed top-6 right-6 z-50 px-4 py-2 text-xs font-medium tracking-wide uppercase border rounded-full backdrop-blur-sm transition-all duration-200 hover:scale-105"
      style={{
        borderColor: designMode ? "var(--accent-color)" : "var(--border)",
        backgroundColor: designMode ? "var(--bg-color)" : "var(--background)",
        color: designMode ? "var(--text-color)" : "var(--foreground)",
      }}
    >
      {designMode ? "Regular UI" : "Design Mode"}
    </button>
  );
};
