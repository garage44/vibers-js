import { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { loadHighResTile } from "../systems/OSMTileLoader";
import type { Region } from "../types/Region";

interface RegionProps {
  region: Region;
  position: [number, number, number];
}

export function RegionComponent({ region, position }: RegionProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loading, setLoading] = useState(true);

  const REGION_SIZE = 256; // meters

  useEffect(() => {
    let cancelled = false;

    async function loadTile() {
      try {
        setLoading(true);
        console.log(`Loading OSM tile for region "${region.name}":`, {
          tile_x: region.tile_x,
          tile_y: region.tile_y,
          tile_z: region.tile_z,
          lat: region.latitude,
          lng: region.longitude,
        });
        // Load high resolution tile (2x2 grid = 512x512 pixels)
        const tileTexture = await loadHighResTile(
          region.tile_x,
          region.tile_y,
          region.tile_z
        );
        if (!cancelled) {
          console.log(`✅ Successfully loaded tile for region "${region.name}"`);
          setTexture(tileTexture);
          setLoading(false);
        }
      } catch (error) {
        console.error(`❌ Failed to load region tile for "${region.name}":`, error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTile();

    return () => {
      cancelled = true;
    };
  }, [region.tile_x, region.tile_y, region.tile_z]);

  useFrame(() => {
    // Region plane stays static
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
        />
      ) : (
        <meshStandardMaterial 
          color={loading ? "#888888" : "#cccccc"}
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  );
}

