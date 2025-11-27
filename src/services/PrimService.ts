import type { Prim, PrimCreateRequest, PrimUpdateRequest } from "../types/Prim";

const API_BASE = "/api/prims";

export class PrimService {
  static async getPrims(regionId?: number): Promise<Prim[]> {
    const url = regionId ? `${API_BASE}?region_id=${regionId}` : API_BASE;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch prims: ${response.statusText}`);
    }
    return response.json();
  }

  static async getPrim(id: number): Promise<Prim> {
    const response = await fetch(`${API_BASE}/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch prim: ${response.statusText}`);
    }
    return response.json();
  }

  static async createPrim(data: PrimCreateRequest): Promise<Prim> {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create prim: ${response.statusText}`);
    }
    return response.json();
  }

  static async updatePrim(id: number, data: PrimUpdateRequest): Promise<Prim> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update prim: ${response.statusText}`);
    }
    return response.json();
  }

  static async deletePrim(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete prim: ${response.statusText}`);
    }
  }
}

