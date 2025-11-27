import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { AvatarState } from "../types/Region";

const AVATAR_HEIGHT = 2.0; // Height of avatar (from ground to top of head)
const AVATAR_RADIUS = 0.3; // Collision radius

interface UseAvatarControllerProps {
  onStateChange?: (state: AvatarState) => void;
  initialPosition?: [number, number, number];
}

const WALK_SPEED = 8; // m/s
const FLY_SPEED = 40; // m/s
const ROTATION_SPEED = 2; // radians/s
const GRAVITY = -9.8; // m/s²
const GROUND_HEIGHT = 0;

export function useAvatarController({
  onStateChange,
  initialPosition = [0, 2, 0],
}: UseAvatarControllerProps = {}) {
  const { camera, scene } = useThree();
  const stateRef = useRef<AvatarState>({
    position: initialPosition,
    rotation: 0,
    isFlying: false,
    isWalking: false,
  });
  
  // Update position if initialPosition changes
  useEffect(() => {
    stateRef.current.position = [...initialPosition];
  }, [initialPosition[0], initialPosition[1], initialPosition[2]]);

  const keysRef = useRef<Set<string>>(new Set());
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const fKeyProcessedRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const cachedPlanesRef = useRef<THREE.Object3D[]>([]);
  const lastCacheUpdateRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for movement keys to avoid scrolling
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift", "f"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      keysRef.current.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    // Use capture phase to ensure we get the events before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, []);

  useFrame((state, delta) => {
    const keys = keysRef.current;
    const avatarState = stateRef.current;
    const velocity = velocityRef.current;

    // Don't move avatar if in free camera mode (camera handles movement)
    if ((window as any).__cameraMode === 'free') {
      return;
    }

    // Check for flying mode toggle (F key) - use a flag to prevent rapid toggling
    const fKeyPressed = keys.has("f");
    if (fKeyPressed && !fKeyProcessedRef.current) {
      avatarState.isFlying = !avatarState.isFlying;
      fKeyProcessedRef.current = true;
      console.log("Fly mode:", avatarState.isFlying ? "ON" : "OFF");
    }
    if (!fKeyPressed) {
      fKeyProcessedRef.current = false;
    }

    // Movement input
    const moveForward = keys.has("w") || keys.has("arrowup");
    const moveBackward = keys.has("s") || keys.has("arrowdown");
    const moveLeft = keys.has("a") || keys.has("arrowleft");
    const moveRight = keys.has("d") || keys.has("arrowright");
    const flyUp = keys.has(" ") || keys.has("space");
    const flyDown = keys.has("shift");

    // Calculate movement direction
    const moveDirection = new THREE.Vector3();
    if (moveForward) moveDirection.z -= 1;
    if (moveBackward) moveDirection.z += 1;
    if (moveLeft) moveDirection.x -= 1;
    if (moveRight) moveDirection.x += 1;

    // Normalize and apply speed
    if (moveDirection.length() > 0) {
      moveDirection.normalize();
      const speed = avatarState.isFlying ? FLY_SPEED : WALK_SPEED;
      moveDirection.multiplyScalar(speed * delta);

      // Rotate movement direction based on avatar rotation
      moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), avatarState.rotation);
      velocity.x = moveDirection.x;
      velocity.z = moveDirection.z;
      avatarState.isWalking = true;
    } else {
      velocity.x = 0;
      velocity.z = 0;
      avatarState.isWalking = false;
    }

    // Handle rotation
    if (moveLeft || moveRight) {
      const rotationDelta = (moveLeft ? 1 : -1) * ROTATION_SPEED * delta;
      avatarState.rotation += rotationDelta;
    }

    // First, check collision to get ground height before applying movement
    const pos = avatarState.position;
    const raycaster = raycasterRef.current;
    const rayOrigin = new THREE.Vector3(pos[0], pos[1] + 20, pos[2]);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, rayDirection);
    
    // Cache plane objects - only update cache every 0.5 seconds to avoid expensive traversals
    const now = performance.now();
    if (now - lastCacheUpdateRef.current > 500 || cachedPlanesRef.current.length === 0) {
      cachedPlanesRef.current = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.geometry instanceof THREE.PlaneGeometry) {
          cachedPlanesRef.current.push(object);
        }
      });
      lastCacheUpdateRef.current = now;
    }
    
    const intersections = raycaster.intersectObjects(cachedPlanesRef.current, true);
    
    let minHeight = GROUND_HEIGHT + AVATAR_HEIGHT / 2; // Default fallback
    
    if (intersections.length > 0) {
      // Find the highest intersection point (closest to avatar)
      let highestPoint = intersections[0].point.y;
      for (const intersection of intersections) {
        if (intersection.point.y > highestPoint) {
          highestPoint = intersection.point.y;
        }
      }
      // Avatar center should be at groundHeight + AVATAR_HEIGHT/2
      minHeight = highestPoint + AVATAR_HEIGHT / 2;
    }

    // Handle vertical movement (flying)
    if (avatarState.isFlying) {
      if (flyUp) {
        velocity.y = FLY_SPEED;
      } else if (flyDown) {
        // Prevent flying down if already at or near ground level
        if (pos[1] > minHeight + 0.1) {
          velocity.y = -FLY_SPEED;
        } else {
          velocity.y = 0;
        }
      } else {
        velocity.y = 0;
      }
    } else {
      // Walking mode: apply gravity
      velocity.y += GRAVITY * delta;
    }

    // Update position
    pos[0] += velocity.x;
    pos[1] += velocity.y * delta;
    pos[2] += velocity.z;

    // Always enforce minimum height to prevent sinking (both walking and flying)
    if (pos[1] < minHeight) {
      pos[1] = minHeight;
      // Stop any downward movement when hitting ground
      if (velocity.y < 0) {
        velocity.y = 0;
      }
    }

    // Camera is now controlled by CameraController system
    // This allows for Second Life-style camera controls

    // Notify state change
    if (onStateChange) {
      onStateChange({
        position: [...avatarState.position],
        rotation: avatarState.rotation,
        isFlying: avatarState.isFlying,
        isWalking: avatarState.isWalking,
      });
    }
  });

  return stateRef.current;
}

