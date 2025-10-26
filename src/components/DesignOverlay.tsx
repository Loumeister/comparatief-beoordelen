import { useState } from "react";

export const DesignOverlay = () => {
  const [fancy, setFancy] = useState(false);

  return (
    <>
      {/* Toggle Button - always visible */}
      <button
        onClick={() => setFancy(!fancy)}
        className="fixed top-6 right-6 z-[9999] px-4 py-2 text-xs tracking-widest uppercase
                   bg-background/80 backdrop-blur-md border border-foreground/20
                   hover:bg-foreground/5 transition-all duration-200 pointer-events-auto
                   font-mono"
        style={{ mixBlendMode: fancy ? "difference" : "normal" }}
      >
        {fancy ? "Regular UI" : "Fancy Mode"}
      </button>

      {/* Overlay Container */}
      {fancy && (
        <div className="fixed inset-0 z-[9998] pointer-events-none overflow-hidden">
          {/* Floating Typography - Top Left */}
          <div
            className="absolute top-[15vh] left-[8vw] max-w-[600px]
                       opacity-0 animate-[fadeIn_0.8s_ease-out_0.3s_forwards]"
            style={{ mixBlendMode: "difference" }}
          >
            <h1 className="text-[clamp(3rem,8vw,7rem)] font-bold leading-[0.9] tracking-tight text-foreground">
              This isn't
              <br />
              decoration
            </h1>
            <p className="mt-8 text-sm tracking-[0.3em] uppercase opacity-60 font-mono">
              It's attitude.
            </p>
          </div>

          {/* Subtle Grid Accent - Bottom Right */}
          <div
            className="absolute bottom-[12vh] right-[10vw] w-[300px] h-[300px]
                       opacity-0 animate-[fadeIn_1s_ease-out_0.6s_forwards]"
          >
            <div
              className="w-full h-full border border-foreground/10"
              style={{ mixBlendMode: "overlay" }}
            >
              <div className="absolute top-1/2 left-0 w-full h-px bg-foreground/10" />
              <div className="absolute top-0 left-1/2 w-px h-full bg-foreground/10" />
            </div>
          </div>

          {/* Floating Label - Center Right */}
          <div
            className="absolute top-[50vh] right-[5vw] -rotate-90 origin-right
                       opacity-0 animate-[fadeIn_0.8s_ease-out_0.9s_forwards]"
          >
            <p className="text-xs tracking-[0.5em] uppercase opacity-40 font-mono">
              A glitch in the grid.
            </p>
          </div>

          {/* Subtle Color Accent - Top Right Corner */}
          <div
            className="absolute top-0 right-0 w-[40vw] h-[40vh]
                       bg-gradient-to-bl from-primary/5 to-transparent
                       opacity-0 animate-[fadeIn_1.2s_ease-out_0.4s_forwards]"
            style={{ mixBlendMode: "multiply" }}
          />

          {/* Minimalist Frame - Bottom Left */}
          <div
            className="absolute bottom-[8vh] left-[6vw] w-[200px] h-[120px]
                       border-l-2 border-b-2 border-foreground/20
                       opacity-0 animate-[fadeIn_0.8s_ease-out_1.1s_forwards]"
            style={{ mixBlendMode: "overlay" }}
          />

          {/* Typographic Detail - Center */}
          <div
            className="absolute top-[40vh] left-[50vw] -translate-x-1/2
                       opacity-0 animate-[fadeIn_1s_ease-out_0.7s_forwards]"
          >
            <div
              className="text-[12vw] font-bold opacity-[0.03] tracking-tighter"
              style={{ mixBlendMode: "difference" }}
            >
              CJ
            </div>
          </div>

          {/* Subtle Shadow Element */}
          <div
            className="absolute top-[25vh] left-[60vw] w-[150px] h-[150px]
                       rounded-full blur-[100px] bg-primary/20
                       opacity-0 animate-[fadeIn_1.5s_ease-out_0.5s_forwards]"
            style={{ mixBlendMode: "multiply" }}
          />

          {/* Editorial Line - Vertical */}
          <div
            className="absolute top-[20vh] left-[50vw] w-px h-[30vh] bg-foreground/10
                       opacity-0 animate-[fadeIn_0.8s_ease-out_1.3s_forwards]"
            style={{ mixBlendMode: "overlay" }}
          />
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
};
