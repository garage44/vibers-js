import type { Database } from "bun:sqlite";

export interface RegionRow {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  tile_x: number;
  tile_y: number;
  tile_z: number;
  created_at: string;
  updated_at: string;
}

export function createRegionsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      tile_x INTEGER NOT NULL,
      tile_y INTEGER NOT NULL,
      tile_z INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create index on tile coordinates for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_regions_tile ON regions(tile_x, tile_y, tile_z)
  `);
}

export interface PrimRow {
  id: number;
  region_id: number;
  name: string;
  shape: string; // 'box', 'sphere', 'cylinder', 'cone', 'torus'
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  scale_x: number;
  scale_y: number;
  scale_z: number;
  color_r: number;
  color_g: number;
  color_b: number;
  created_at: string;
  updated_at: string;
}

export function createPrimsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT 'Prim',
      shape TEXT NOT NULL DEFAULT 'box',
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      position_z REAL NOT NULL DEFAULT 0,
      rotation_x REAL NOT NULL DEFAULT 0,
      rotation_y REAL NOT NULL DEFAULT 0,
      rotation_z REAL NOT NULL DEFAULT 0,
      scale_x REAL NOT NULL DEFAULT 1,
      scale_y REAL NOT NULL DEFAULT 1,
      scale_z REAL NOT NULL DEFAULT 1,
      color_r REAL NOT NULL DEFAULT 0.5,
      color_g REAL NOT NULL DEFAULT 0.5,
      color_b REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
    )
  `);

  // Create index on region_id for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prims_region ON prims(region_id)
  `);
}

