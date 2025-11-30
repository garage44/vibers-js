import { useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const MAX_VISIBLE_DISTANCE = 500; // Maximum distance to render objects
export const MAX_SHADOW_DISTANCE = 100; // Maximum distance to cast shadows
export const REGION_VISIBLE_DISTANCE = 400; // Maximum distance to render regions

/**
 * Calculate distance from camera to position
 */
export function getDistanceFromCamera(
  camera: THREE.Camera,
  position: [number, number, number] | THREE.Vector3
): number {
  const pos = position instanceof THREE.Vector3
    ? position
    : new THREE.Vector3(...position);
  return camera.position.distanceTo(pos);
}

/**
 * Check if object should be visible based on distance
 */
export function shouldBeVisible(distance: number): boolean {
  return distance < MAX_VISIBLE_DISTANCE;
}

/**
 * Check if object should cast shadows based on distance
 */
export function shouldCastShadows(distance: number): boolean {
  return distance < MAX_SHADOW_DISTANCE;
}

/**
 * Calculate LOD level based on distance
 * Returns: 0 = high detail, 1 = medium detail, 2 = low detail
 */
export function getLODLevel(distance: number): number {
  if (distance < 50) {
    return 0; // High detail
  } else if (distance < 150) {
    return 1; // Medium detail
  } else {
    return 2; // Low detail
  }
}

/**
 * Get geometry segments based on LOD level
 */
export function getSegmentsForLOD(baseSegments: number, lod: number): number {
  switch (lod) {
    case 0: return baseSegments; // High detail
    case 1: return Math.max(8, Math.floor(baseSegments / 2)); // Medium detail
    case 2: return Math.max(4, Math.floor(baseSegments / 4)); // Low detail
    default: return baseSegments;
  }
}
