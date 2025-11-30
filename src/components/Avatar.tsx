import { useRef, useEffect, useState, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import type { AvatarState } from "../types/Region";

interface AvatarProps {
  state: AvatarState;
  onStateChange?: (state: AvatarState) => void;
}

// Model URL from three.js examples (robot character with skinning and morphing)
// Using the same model as the webgl_animation_skinning_morph example
const MODEL_URL = "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

// Simple placeholder avatar (capsule shape) if model is not available
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
        castShadow={false}
        receiveShadow={false}
      >
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshStandardMaterial color="#4a90e2" />
      </mesh>
      {/* Head */}
      <mesh
        position={[0, 2, 0]}
        castShadow={false}
        receiveShadow={false}
      >
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color="#fdbcb4" />
      </mesh>
    </group>
  );
}

// Animated avatar using three.js example model
function AnimatedAvatar({ state }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions, mixer } = useAnimations(animations, scene);

  const previousActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Add scene to group and set up model
  useEffect(() => {
    if (scene && groupRef.current) {
      // Clear any existing children
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }

      // Scale model to appropriate size relative to the map
      // Robot model is scaled down to be proportional to map tiles
      scene.scale.setScalar(0.3);

      // Ensure model is positioned correctly
      scene.position.set(0, 0, 0);

      // Robot model faces backward by default, rotate 180 degrees to face forward
      scene.rotation.y = Math.PI;

      groupRef.current.add(scene);

      // Traverse and enable shadows if needed
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
    }
  }, [scene]);

  // Set up animations based on avatar state (matching three.js example pattern)
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;

    // Find available animations - check common naming patterns
    const actionNames = Object.keys(actions);
    // Removed console.log for performance

    // Try to find animations with common names (case-insensitive)
    const findAction = (names: string[]) => {
      for (const name of names) {
        const exact = actions[name];
        if (exact) return exact;
        // Case-insensitive search
        const found = actionNames.find(a => a.toLowerCase() === name.toLowerCase());
        if (found) return actions[found];
      }
      return null;
    };

    const idleAction = findAction(["idle", "Idle", "TPose", "T-Pose", "idle_eyes"]) || Object.values(actions)[0];
    const walkAction = findAction(["walk", "Walk", "Walking", "walking", "walking_eyes"]) || idleAction;

    let targetAction: THREE.AnimationAction | null = null;

    // Only use walk animation when actually walking, otherwise use idle
    if (state.isWalking && !state.isFlying) {
      targetAction = walkAction;
    } else {
      // Use idle animation when not moving or when flying
      targetAction = idleAction;
    }

    // Only update animation if target action changed
    if (targetAction && targetAction !== currentActionRef.current) {
      // Fade out previous action
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.3);
      }

      // Start new action
      targetAction.reset().fadeIn(0.3).play();
      previousActionRef.current = currentActionRef.current;
      currentActionRef.current = targetAction;
    }

    // Ensure current action is playing (in case it was stopped)
    if (currentActionRef.current && !currentActionRef.current.isRunning()) {
      currentActionRef.current.play();
    }
  }, [actions, state.isWalking, state.isFlying]);

  // Update mixer every frame
  useFrame((_, delta) => {
    if (mixer) {
      mixer.update(delta);
    }

    // Update position and rotation
    if (groupRef.current) {
      groupRef.current.position.set(...state.position);
      groupRef.current.rotation.y = state.rotation;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (actions) {
        Object.values(actions).forEach((action) => {
          if (action) {
            action.stop();
            action.fadeOut(0.1);
          }
        });
      }
    };
  }, [actions]);

  return <group ref={groupRef} />;
}

// Main avatar component with Suspense for loading
export function Avatar({ state, onStateChange }: AvatarProps) {
  const [usePlaceholder, setUsePlaceholder] = useState(false);

  if (usePlaceholder) {
    return <PlaceholderAvatar state={state} onStateChange={onStateChange} />;
  }

  return (
    <Suspense fallback={<PlaceholderAvatar state={state} onStateChange={onStateChange} />}>
      <AnimatedAvatarWrapper
        state={state}
        onStateChange={onStateChange}
        onError={() => setUsePlaceholder(true)}
      />
    </Suspense>
  );
}

// Wrapper to handle errors
function AnimatedAvatarWrapper({ state, onStateChange, onError }: AvatarProps & { onError: () => void }) {
  useEffect(() => {
    // Error boundary effect
    const handleError = () => onError();
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, [onError]);

  try {
    return <AnimatedAvatar state={state} onStateChange={onStateChange} />;
  } catch (error) {
    console.warn("Failed to load animated avatar:", error);
    onError();
    return <PlaceholderAvatar state={state} onStateChange={onStateChange} />;
  }
}
