export interface PrimDB {
  id: number;
  region_id: number;
  name: string;
  shape: string;
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

export interface PrimCreateData {
  region_id: number;
  name?: string;
  shape?: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  rotation_x?: number;
  rotation_y?: number;
  rotation_z?: number;
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
  color_r?: number;
  color_g?: number;
  color_b?: number;
}

export interface PrimUpdateData {
  name?: string;
  shape?: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  rotation_x?: number;
  rotation_y?: number;
  rotation_z?: number;
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
  color_r?: number;
  color_g?: number;
  color_b?: number;
}

