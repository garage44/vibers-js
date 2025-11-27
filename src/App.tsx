import { useState } from "react";
import { World } from "./components/World";
import "./index.css";

export function App() {
  const [isDay, setIsDay] = useState(true);

  return (
    <div className="app">
      <World isDay={isDay} />
      <div className="ui-overlay">
        <div className="controls-info">
          <h3>Controls</h3>
          <p>WASD / Arrow Keys - Move</p>
          <p>Space - Fly Up</p>
          <p>Shift - Fly Down</p>
          <p>F - Toggle Fly/Walk Mode</p>
          <p>Right-Click + Drag - Rotate Camera</p>
          <p>Scroll Wheel - Zoom In/Out</p>
          <p>T/1 - Translate Mode</p>
          <p>R/2 - Rotate Mode</p>
          <p>S/3 - Scale Mode</p>
        </div>
        <div className="day-night-toggle">
          <button
            onClick={() => setIsDay(!isDay)}
            className="toggle-button"
            aria-label={isDay ? "Switch to Night" : "Switch to Day"}
          >
            {isDay ? "☀️ Day" : "🌙 Night"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
