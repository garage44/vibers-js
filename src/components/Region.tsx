import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadHighResTile, loadLowResTile } from "../systems/OSMTileLoader";
import type { Region } from "../types/Region";
import { getDistanceFromCamera, REGION_VISIBLE_DISTANCE } from "../hooks/useVisibility";

interface RegionProps {
  region: Region;
  position: [number, number, number];
}

export function RegionComponent({ region, position }: RegionProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loading, setLoading] = useState(true);
  const lastCheckRef = useRef(0);
  const currentLODRef = useRef<number>(-1); // Track current LOD to avoid reloading
  const textureLoadingRef = useRef(false); // Prevent concurrent loads

  const REGION_SIZE = 256; // meters

  // Texture quality thresholds (in meters) - with hysteresis to prevent rapid switching
  const HIGH_RES_DISTANCE = 120; // Use 512x512 when closer than this
  const HIGH_RES_DISTANCE_HYSTERESIS = 140; // Switch back to high-res only when closer than this
  const MEDIUM_RES_DISTANCE = 250; // Use 256x256 between this and HIGH_RES
  const MEDIUM_RES_DISTANCE_HYSTERESIS = 280; // Switch back to medium-res only when closer than this

  // Determine texture LOD based on distance with hysteresis
  const getTextureLOD = (distance: number, currentLOD: number): number => {
    if (currentLOD === 0) {
      // Currently high-res: switch to medium only when far enough
      if (distance > HIGH_RES_DISTANCE_HYSTERESIS) {
        return 1;
      }
      return 0;
    } else if (currentLOD === 1) {
      // Currently medium-res: switch based on distance with hysteresis
      if (distance < HIGH_RES_DISTANCE) {
        return 0; // Switch to high-res
      } else if (distance > MEDIUM_RES_DISTANCE_HYSTERESIS) {
        return 2; // Switch to low-res
      }
      return 1;
    } else {
      // Currently low-res: switch to medium only when close enough
      if (distance < MEDIUM_RES_DISTANCE) {
        return 1;
      }
      return 2;
    }
  };

  // Load texture based on LOD level - using ref to access latest region values
  const regionRef = useRef(region);
  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  const loadTextureForLOD = useRef(async (lod: number) => {
    if (textureLoadingRef.current) return;

    textureLoadingRef.current = true;
    const currentRegion = regionRef.current;

    try {
      setLoading(true);
      let tileTexture: THREE.Texture;

      if (lod === 0) {
        // High-res: 512x512 (2x2 grid)
        tileTexture = await loadHighResTile(
          currentRegion.tile_x,
          currentRegion.tile_y,
          currentRegion.tile_z
        );
      } else {
        // Medium/Low-res: 256x256 (single tile)
        tileTexture = await loadLowResTile(
          currentRegion.tile_x,
          currentRegion.tile_y,
          currentRegion.tile_z
        );
      }

      // Ensure texture is properly configured
      tileTexture.flipY = true;
      tileTexture.needsUpdate = true;

      // For low-res textures, ensure they cover the same area as high-res
      // High-res covers 2x2 tiles, low-res covers 1 tile
      // Reset offset and repeat to ensure consistent mapping
      tileTexture.offset.set(0, 0);
      tileTexture.repeat.set(1, 1);

      setTexture(tileTexture);
      setLoading(false);
      currentLODRef.current = lod;
    } catch {
      // Silently handle errors - texture loading failures shouldn't crash the app
      setLoading(false);
    } finally {
      textureLoadingRef.current = false;
    }
  });

  // Initial load - start with medium quality
  useEffect(() => {
    loadTextureForLOD.current(1);
  }, [region.tile_x, region.tile_y, region.tile_z]);

  useFrame(() => {
    // Throttle visibility checks to every 500ms (regions are large, less frequent checks)
    const now = performance.now();
    if (now - lastCheckRef.current > 500 && meshRef.current) {
      const distance = getDistanceFromCamera(camera, position);
      const isVisible = distance < REGION_VISIBLE_DISTANCE;
      meshRef.current.visible = isVisible;

      // Update texture quality based on distance (LOD) with hysteresis
      if (isVisible) {
        const newLOD = getTextureLOD(distance, currentLODRef.current);
        // Only reload texture if LOD changed
        if (newLOD !== currentLODRef.current && !textureLoadingRef.current) {
          loadTextureForLOD.current(newLOD);
        }
      }

      lastCheckRef.current = now;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      castShadow={false}
      onClick={(e) => {
        // Mark that region was clicked to trigger deselection
        e.stopPropagation();
        // Use a small delay to ensure this happens after prim click handlers
        setTimeout(() => {
          if ((window as any).__onRegionClick) {
            (window as any).__onRegionClick();
          }
        }, 20);
      }}
    >
      <planeGeometry args={[REGION_SIZE, REGION_SIZE]} />
      {texture ? (
        <meshBasicMaterial
          map={texture}
          side={THREE.DoubleSide}
          transparent={false}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color={loading ? "#888888" : "#cccccc"}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      )}
    </mesh>
  );
}
