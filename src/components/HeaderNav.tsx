import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export const HeaderNav = () => {
  const [isDark, setIsDark] = useState(false);
  const [designMode, setDesignMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("darkMode");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = stored ? stored === "true" : prefersDark;
    
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle("dark", shouldBeDark);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("design-mode", designMode);
  }, [designMode]);

  const toggleDark = () => {
    const newValue = !isDark;
    setIsDark(newValue);
    localStorage.setItem("darkMode", String(newValue));
    document.documentElement.classList.toggle("dark", newValue);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDesignMode(!designMode)}
        className="text-xs font-medium tracking-wide uppercase"
      >
        {designMode ? "Regular UI" : "Design Mode"}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={toggleDark}
        aria-label="Toggle dark mode"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>
    </div>
  );
};
