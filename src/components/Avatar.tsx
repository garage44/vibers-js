import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AvatarState } from "../types/Region";

interface AvatarProps {
  state: AvatarState;
  onStateChange?: (state: AvatarState) => void;
}

// Simple placeholder avatar (capsule shape) if Ruth model is not available
function PlaceholderAvatar({ state }: AvatarProps) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(...state.position);
      meshRef.current.rotation.y = state.rotation;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Body (capsule) */}
      <mesh 
        position={[0, 1, 0]} 
        castShadow
        receiveShadow={false}
      >
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshStandardMaterial color="#4a90e2" />
      </mesh>
      {/* Head */}
      <mesh 
        position={[0, 2, 0]} 
        castShadow
        receiveShadow={false}
      >
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color="#fdbcb4" />
      </mesh>
    </group>
  );
}

// Try to load Ruth model, fallback to placeholder
function RuthAvatar({ state }: AvatarProps) {
  // For now, we'll use placeholder since we don't have the Ruth model URL
  // In a real implementation, you would load it like:
  // const { scene } = useGLTF("/models/ruth.glb");
  return <PlaceholderAvatar state={state} />;
}

export function Avatar({ state, onStateChange }: AvatarProps) {
  return <RuthAvatar state={state} onStateChange={onStateChange} />;
}

