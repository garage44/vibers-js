export interface RegionDB {
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

export interface RegionCreateData {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RegionUpdateData {
  name?: string;
  latitude?: number;
  longitude?: number;
}

