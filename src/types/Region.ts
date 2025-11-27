export interface Region {
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

export interface RegionCreateRequest {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RegionUpdateRequest {
  name?: string;
  latitude?: number;
  longitude?: number;
}

export interface AvatarState {
  position: [number, number, number];
  rotation: number;
  isFlying: boolean;
  isWalking: boolean;
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

