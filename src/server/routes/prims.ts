import { getDatabase } from "../db/migrations";
import type { PrimDB, PrimCreateData, PrimUpdateData } from "../types/Prim";

export async function getPrims(regionId?: string): Promise<Response> {
  try {
    const db = getDatabase();
    let prims: PrimDB[];
    
    if (regionId) {
      const stmt = db.prepare("SELECT * FROM prims WHERE region_id = ? ORDER BY created_at DESC");
      prims = stmt.all(parseInt(regionId)) as PrimDB[];
    } else {
      const stmt = db.prepare("SELECT * FROM prims ORDER BY created_at DESC");
      prims = stmt.all() as PrimDB[];
    }

    return Response.json(prims, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching prims:", error);
    return Response.json(
      { error: "Failed to fetch prims", details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function getPrim(id: string): Promise<Response> {
  try {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM prims WHERE id = ?");
    const prim = stmt.get(parseInt(id)) as PrimDB | undefined;

    if (!prim) {
      return Response.json(
        { error: "Prim not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return Response.json(prim, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching prim:", error);
    return Response.json(
      { error: "Failed to fetch prim" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function createPrim(req: Request): Promise<Response> {
  try {
    const data = (await req.json()) as PrimCreateData;

    if (typeof data.region_id !== "number") {
      return Response.json(
        { error: "Invalid request data. Required: region_id" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify region exists
    const db = getDatabase();
    const regionStmt = db.prepare("SELECT id FROM regions WHERE id = ?");
    const region = regionStmt.get(data.region_id);
    
    if (!region) {
      return Response.json(
        { error: "Region not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const stmt = db.prepare(`
      INSERT INTO prims (
        region_id, name, shape,
        position_x, position_y, position_z,
        rotation_x, rotation_y, rotation_z,
        scale_x, scale_y, scale_z,
        color_r, color_g, color_b,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      data.region_id,
      data.name || "Prim",
      data.shape || "box",
      data.position_x ?? 0,
      data.position_y ?? 0,
      data.position_z ?? 0,
      data.rotation_x ?? 0,
      data.rotation_y ?? 0,
      data.rotation_z ?? 0,
      data.scale_x ?? 1,
      data.scale_y ?? 1,
      data.scale_z ?? 1,
      data.color_r ?? 0.5,
      data.color_g ?? 0.5,
      data.color_b ?? 0.5
    );

    const getStmt = db.prepare("SELECT * FROM prims WHERE id = ?");
    const prim = getStmt.get(result.lastInsertRowId) as PrimDB;

    return Response.json(prim, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating prim:", error);
    return Response.json(
      { error: "Failed to create prim", details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function updatePrim(id: string, req: Request): Promise<Response> {
  try {
    const data = (await req.json()) as PrimUpdateData;

    const db = getDatabase();
    const getStmt = db.prepare("SELECT * FROM prims WHERE id = ?");
    const existing = getStmt.get(parseInt(id)) as PrimDB | undefined;

    if (!existing) {
      return Response.json(
        { error: "Prim not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.shape !== undefined) {
      updates.push("shape = ?");
      values.push(data.shape);
    }
    if (data.position_x !== undefined) {
      updates.push("position_x = ?");
      values.push(data.position_x);
    }
    if (data.position_y !== undefined) {
      updates.push("position_y = ?");
      values.push(data.position_y);
    }
    if (data.position_z !== undefined) {
      updates.push("position_z = ?");
      values.push(data.position_z);
    }
    if (data.rotation_x !== undefined) {
      updates.push("rotation_x = ?");
      values.push(data.rotation_x);
    }
    if (data.rotation_y !== undefined) {
      updates.push("rotation_y = ?");
      values.push(data.rotation_y);
    }
    if (data.rotation_z !== undefined) {
      updates.push("rotation_z = ?");
      values.push(data.rotation_z);
    }
    if (data.scale_x !== undefined) {
      updates.push("scale_x = ?");
      values.push(data.scale_x);
    }
    if (data.scale_y !== undefined) {
      updates.push("scale_y = ?");
      values.push(data.scale_y);
    }
    if (data.scale_z !== undefined) {
      updates.push("scale_z = ?");
      values.push(data.scale_z);
    }
    if (data.color_r !== undefined) {
      updates.push("color_r = ?");
      values.push(data.color_r);
    }
    if (data.color_g !== undefined) {
      updates.push("color_g = ?");
      values.push(data.color_g);
    }
    if (data.color_b !== undefined) {
      updates.push("color_b = ?");
      values.push(data.color_b);
    }

    if (updates.length === 0) {
      return Response.json(existing, {
        headers: { "Content-Type": "application/json" },
      });
    }

    updates.push("updated_at = datetime('now')");
    values.push(parseInt(id));

    const stmt = db.prepare(`
      UPDATE prims SET ${updates.join(", ")} WHERE id = ?
    `);

    stmt.run(...values);

    const updatedStmt = db.prepare("SELECT * FROM prims WHERE id = ?");
    const updated = updatedStmt.get(parseInt(id)) as PrimDB;

    return Response.json(updated, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating prim:", error);
    return Response.json(
      { error: "Failed to update prim" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function deletePrim(id: string): Promise<Response> {
  try {
    const db = getDatabase();
    const getStmt = db.prepare("SELECT * FROM prims WHERE id = ?");
    const existing = getStmt.get(parseInt(id)) as PrimDB | undefined;

    if (!existing) {
      return Response.json(
        { error: "Prim not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const stmt = db.prepare("DELETE FROM prims WHERE id = ?");
    stmt.run(parseInt(id));

    return Response.json(
      { message: "Prim deleted successfully" },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting prim:", error);
    return Response.json(
      { error: "Failed to delete prim" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

