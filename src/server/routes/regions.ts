import { getDatabase } from "../db/migrations";
import { latLngToTile, REGION_ZOOM_LEVEL } from "../utils/tileUtils";
import type { RegionDB, RegionCreateData, RegionUpdateData } from "../types/Region";

export async function getRegions(): Promise<Response> {
  try {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM regions ORDER BY created_at DESC");
    const regions = stmt.all() as RegionDB[];

    console.log(`Found ${regions.length} regions`);
    return Response.json(regions, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching regions:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack);
    }
    return Response.json(
      { error: "Failed to fetch regions", details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function getRegion(id: string): Promise<Response> {
  try {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM regions WHERE id = ?");
    const region = stmt.get(parseInt(id)) as RegionDB | undefined;

    if (!region) {
      return Response.json(
        { error: "Region not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return Response.json(region, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching region:", error);
    return Response.json(
      { error: "Failed to fetch region" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function createRegion(req: Request): Promise<Response> {
  try {
    const data = (await req.json()) as RegionCreateData;

    if (!data.name || typeof data.latitude !== "number" || typeof data.longitude !== "number") {
      return Response.json(
        { error: "Invalid request data. Required: name, latitude, longitude" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tile = latLngToTile(data.latitude, data.longitude, REGION_ZOOM_LEVEL);

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO regions (name, latitude, longitude, tile_x, tile_y, tile_z, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      data.name,
      data.latitude,
      data.longitude,
      tile.x,
      tile.y,
      REGION_ZOOM_LEVEL
    );

    const getStmt = db.prepare("SELECT * FROM regions WHERE id = ?");
    const region = getStmt.get(result.lastInsertRowId) as RegionDB;

    return Response.json(region, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating region:", error);
    return Response.json(
      { error: "Failed to create region" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function updateRegion(id: string, req: Request): Promise<Response> {
  try {
    const data = (await req.json()) as RegionUpdateData;

    const db = getDatabase();
    const getStmt = db.prepare("SELECT * FROM regions WHERE id = ?");
    const existing = getStmt.get(parseInt(id)) as RegionDB | undefined;

    if (!existing) {
      return Response.json(
        { error: "Region not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }

    if (data.latitude !== undefined || data.longitude !== undefined) {
      const lat = data.latitude ?? existing.latitude;
      const lng = data.longitude ?? existing.longitude;
      const tile = latLngToTile(lat, lng, REGION_ZOOM_LEVEL);

      updates.push("latitude = ?", "longitude = ?", "tile_x = ?", "tile_y = ?");
      values.push(lat, lng, tile.x, tile.y);
    }

    if (updates.length === 0) {
      return Response.json(existing, {
        headers: { "Content-Type": "application/json" },
      });
    }

    updates.push("updated_at = datetime('now')");
    values.push(parseInt(id));

    const stmt = db.prepare(`
      UPDATE regions SET ${updates.join(", ")} WHERE id = ?
    `);

    stmt.run(...values);

    const updatedStmt = db.prepare("SELECT * FROM regions WHERE id = ?");
    const updated = updatedStmt.get(parseInt(id)) as RegionDB;

    return Response.json(updated, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating region:", error);
    return Response.json(
      { error: "Failed to update region" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function deleteRegion(id: string): Promise<Response> {
  try {
    const db = getDatabase();
    const getStmt = db.prepare("SELECT * FROM regions WHERE id = ?");
    const existing = getStmt.get(parseInt(id)) as RegionDB | undefined;

    if (!existing) {
      return Response.json(
        { error: "Region not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const stmt = db.prepare("DELETE FROM regions WHERE id = ?");
    stmt.run(parseInt(id));

    return Response.json(
      { message: "Region deleted successfully" },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting region:", error);
    return Response.json(
      { error: "Failed to delete region" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

