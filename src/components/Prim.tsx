import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Prim } from "../types/Prim";

interface PrimProps {
  prim: Prim;
  selected?: boolean;
  onSelect?: () => void;
  onRightClick?: () => void;
}

export function PrimComponent({ prim, selected = false, onSelect, onRightClick }: PrimProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    switch (prim.shape) {
      case "box":
        return new THREE.BoxGeometry(prim.scale_x, prim.scale_y, prim.scale_z);
      case "sphere":
        return new THREE.SphereGeometry(
          Math.max(prim.scale_x, prim.scale_y, prim.scale_z) / 2,
          32,
          32
        );
      case "cylinder":
        return new THREE.CylinderGeometry(
          prim.scale_x / 2,
          prim.scale_x / 2,
          prim.scale_y,
          32
        );
      case "cone":
        return new THREE.ConeGeometry(
          prim.scale_x / 2,
          prim.scale_y,
          32
        );
      case "torus":
        return new THREE.TorusGeometry(
          prim.scale_x / 2,
          prim.scale_y / 4,
          16,
          32
        );
      default:
        return new THREE.BoxGeometry(prim.scale_x, prim.scale_y, prim.scale_z);
    }
  }, [prim.shape, prim.scale_x, prim.scale_y, prim.scale_z]);

  const color = useMemo(
    () => new THREE.Color(prim.color_r, prim.color_g, prim.color_b),
    [prim.color_r, prim.color_g, prim.color_b]
  );

  useFrame(() => {
    if (meshRef.current) {
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
      castShadow
      receiveShadow
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

