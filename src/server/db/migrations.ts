import Database from "bun:sqlite";
import { createRegionsTable, createPrimsTable } from "./schema";
import { latLngToTile, REGION_ZOOM_LEVEL } from "../utils/tileUtils";
import { mkdirSync } from "fs";
import { existsSync } from "fs";

const DB_PATH = "./data/regions.db";

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    // Ensure data directory exists
    try {
      if (!existsSync("./data")) {
        mkdirSync("./data", { recursive: true });
      }
    } catch (error) {
      // Ignore if directory already exists or creation fails
      console.warn("Could not create data directory:", error);
    }

    try {
      dbInstance = new Database(DB_PATH);
      runMigrations(dbInstance);
    } catch (error) {
      console.error("Failed to open database:", error);
      throw error;
    }
  }
  return dbInstance;
}

function runMigrations(db: Database): void {
  createRegionsTable(db);
  createPrimsTable(db);

  // Check if we need to seed default region (Groningen)
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM regions");
  const result = countStmt.get() as { count: number };

  if (result.count === 0) {
    // Insert default region at Groningen
    const groningenLat = 53.2194;
    const groningenLng = 6.5665;
    const tile = latLngToTile(groningenLat, groningenLng, REGION_ZOOM_LEVEL);

    const insertStmt = db.prepare(`
      INSERT INTO regions (name, latitude, longitude, tile_x, tile_y, tile_z, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    insertStmt.run("Groningen", groningenLat, groningenLng, tile.x, tile.y, REGION_ZOOM_LEVEL);
    console.log("✅ Seeded default region: Groningen");
  }
}

