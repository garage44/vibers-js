import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Prim } from "../types/Prim";
import { getDistanceFromCamera, shouldBeVisible, shouldCastShadows, getLODLevel, getSegmentsForLOD } from "../hooks/useVisibility";

interface PrimProps {
  prim: Prim;
  selected?: boolean;
  onSelect?: () => void;
  onRightClick?: () => void;
}

export function PrimComponent({ prim, selected = false, onSelect, onRightClick }: PrimProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const position: [number, number, number] = [prim.position_x, prim.position_y, prim.position_z];
  const lastCheckRef = useRef(0);
  const lodRef = useRef(0);

  // Calculate initial values for visibility and shadows
  const initialDistance = getDistanceFromCamera(camera, position);
  const initialLOD = getLODLevel(initialDistance);
  const initialShouldCastShadow = shouldCastShadows(initialDistance);

  const geometry = useMemo(() => {
    const segments = getSegmentsForLOD(32, initialLOD);
    const torusSegments = getSegmentsForLOD(16, initialLOD);
    const torusTubularSegments = getSegmentsForLOD(32, initialLOD);

    switch (prim.shape) {
      case "box":
        return new THREE.BoxGeometry(prim.scale_x, prim.scale_y, prim.scale_z);
      case "sphere":
        return new THREE.SphereGeometry(
          Math.max(prim.scale_x, prim.scale_y, prim.scale_z) / 2,
          segments,
          segments
        );
      case "cylinder":
        return new THREE.CylinderGeometry(
          prim.scale_x / 2,
          prim.scale_x / 2,
          prim.scale_y,
          segments
        );
      case "cone":
        return new THREE.ConeGeometry(
          prim.scale_x / 2,
          prim.scale_y,
          segments
        );
      case "torus":
        return new THREE.TorusGeometry(
          prim.scale_x / 2,
          prim.scale_y / 4,
          torusSegments,
          torusTubularSegments
        );
      default:
        return new THREE.BoxGeometry(prim.scale_x, prim.scale_y, prim.scale_z);
    }
  }, [prim.shape, prim.scale_x, prim.scale_y, prim.scale_z, initialLOD]);

  const color = useMemo(
    () => new THREE.Color(prim.color_r, prim.color_g, prim.color_b),
    [prim.color_r, prim.color_g, prim.color_b]
  );

  useFrame(() => {
    if (!meshRef.current) return;

    // Throttle visibility checks to every 100ms
    const now = performance.now();
    if (now - lastCheckRef.current > 100) {
      const distance = getDistanceFromCamera(camera, position);
      const isVisible = shouldBeVisible(distance);
      const castShadow = shouldCastShadows(distance);
      const newLOD = getLODLevel(distance);

      meshRef.current.visible = isVisible;
      meshRef.current.castShadow = castShadow && isVisible;

      // Update geometry if LOD changed (would need to recreate geometry, but that's expensive)
      // For now, we'll just update visibility and shadows
      lodRef.current = newLOD;
      lastCheckRef.current = now;
    }

    if (meshRef.current.visible) {
      meshRef.current.position.set(
        prim.position_x,
        prim.position_y,
        prim.position_z
      );
      meshRef.current.rotation.set(
        prim.rotation_x,
        prim.rotation_y,
        prim.rotation_z
      );
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        // Mark that a prim was clicked to prevent deselection
        if ((window as any).__primClicked) {
          (window as any).__primClicked();
        }
        onSelect?.();
      }}
      onContextMenu={(e) => {
        // Don't stop propagation - let the global handler in World.tsx handle it
        // The global handler uses raycasting to detect prims, so it will work
      }}
      castShadow={false}
      receiveShadow={false}
    >
      <meshStandardMaterial
        color={selected ? color.clone().multiplyScalar(1.5) : color}
        emissive={selected ? color.clone().multiplyScalar(0.2) : new THREE.Color(0, 0, 0)}
        transparent={selected}
        opacity={selected ? 0.85 : 1.0}
      />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color="#00ffff" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
}
