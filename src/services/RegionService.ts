import type { Region, RegionCreateRequest, RegionUpdateRequest } from "../types/Region";

const API_BASE = "/api/regions";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const RegionService = {
  async getRegions(): Promise<Region[]> {
    const response = await fetch(API_BASE);
    return handleResponse<Region[]>(response);
  },

  async getRegion(id: number): Promise<Region> {
    const response = await fetch(`${API_BASE}/${id}`);
    return handleResponse<Region>(response);
  },

  async createRegion(data: RegionCreateRequest): Promise<Region> {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return handleResponse<Region>(response);
  },

  async updateRegion(id: number, data: RegionUpdateRequest): Promise<Region> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return handleResponse<Region>(response);
  },

  async deleteRegion(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
  },
};

