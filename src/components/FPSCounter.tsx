import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";

// Global stats instance
let globalStats: any = null;

function StatsUpdater() {
  useFrame(() => {
    // Stats updates are lightweight, no need to throttle
    if (globalStats) {
      globalStats.begin();
      globalStats.end();
    }
  });
  return null;
}

export function FPSCounter() {
  useEffect(() => {
    // Dynamically import stats.js
    import("stats.js").then((StatsModule: any) => {
      const StatsClass = StatsModule.default || StatsModule;

      // Create stats.js instance (same as three.js examples)
      if (!globalStats) {
        globalStats = new StatsClass();
        globalStats.showPanel(0); // 0: fps, 1: ms, 2: mb

        // Style it like three.js examples
        globalStats.dom.style.position = "fixed";
        globalStats.dom.style.top = "10px";
        globalStats.dom.style.left = "10px";
        globalStats.dom.style.zIndex = "1000";

        document.body.appendChild(globalStats.dom);
      }
    }).catch((err) => {
      console.error("Failed to load stats.js:", err);
    });

    return () => {
      // Don't remove on unmount, keep it for the app lifetime
    };
  }, []);

  return null;
}

// Component to update stats from within Canvas
export function StatsUpdaterComponent() {
  return <StatsUpdater />;
}
