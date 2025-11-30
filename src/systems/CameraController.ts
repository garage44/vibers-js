import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Second Life-style camera controller
 *
 * Default Mode (Avatar-Following):
 * - Left Mouse Button + Drag: Rotate camera around avatar (orbit)
 * - Shift + Left Mouse Button + Drag: Pan camera (move camera position)
 * - Middle Mouse Button + Drag: Pan camera (alternative)
 * - Mouse Wheel: Zoom in/out
 * - Escape: Reset camera pan offset
 *
 * Free Camera Mode (FPS-style, Three.js best practices):
 * - Alt + Left Click: Enter free camera mode
 * - Right Mouse Button + Drag: Mouse look (rotate camera)
 * - WASD / Arrow Keys: Move forward/backward/left/right
 * - Space / PageUp: Move up
 * - Q / PageDown: Move down
 * - Shift: Move faster
 * - Ctrl: Move slower
 * - Mouse Wheel: Zoom in/out (when not moving)
 * - Escape: Exit free camera mode, return to avatar-following
 *
 * - Right Mouse Button: Context menu (handled in World.tsx)
 *
 * Note: Camera rotation is disabled when dragging prims/gizmo
 */

interface UseCameraControllerProps {
  avatarPosition: [number, number, number];
  isFlying?: boolean;
  enabled?: boolean;
}

type CameraMode = 'avatar' | 'free';

const MIN_DISTANCE = 2; // Minimum zoom distance
const MAX_DISTANCE = 100; // Maximum zoom distance
const MIN_PITCH = -Math.PI / 3; // Minimum pitch angle (can't look too far up)
const MAX_PITCH = Math.PI / 2.5; // Maximum pitch angle (can't look below ground)
const ZOOM_SENSITIVITY = 0.1;
const ROTATION_SENSITIVITY = 0.005;
const PITCH_SENSITIVITY = 0.005;
const PAN_SENSITIVITY = 0.02; // Pan sensitivity (increased for better responsiveness)
const GROUND_HEIGHT = 0;

export function useCameraController({
  avatarPosition,
  isFlying = false,
  enabled = true,
}: UseCameraControllerProps) {
  const { camera, scene } = useThree();

  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartedWithMiddleButtonRef = useRef(false); // Track if panning started with middle mouse
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const cameraModeRef = useRef<CameraMode>('avatar'); // 'avatar' or 'free'

  // Helper function to update camera mode and sync with window
  const setCameraMode = (mode: CameraMode) => {
    cameraModeRef.current = mode;
    (window as any).__cameraMode = mode;
  };

  // Expose camera mode to window for avatar controller to check
  useEffect(() => {
    (window as any).__cameraMode = cameraModeRef.current;
    return () => {
      delete (window as any).__cameraMode;
    };
  }, []);
  const freeCameraFocusRef = useRef<THREE.Vector3 | null>(null); // Focus point for free camera
  const freeCameraPositionRef = useRef<THREE.Vector3 | null>(null); // Camera position in free mode
  const keysRef = useRef<Set<string>>(new Set()); // Track pressed keys for WASD movement
  const cameraStateRef = useRef({
    distance: 5, // Distance from avatar or focus point
    azimuth: 0, // Horizontal rotation around avatar/focus
    pitch: Math.PI / 6, // Vertical angle (pitch up/down)
    panOffset: new THREE.Vector3(0, 0, 0), // Pan offset from avatar center
  });
  const cachedPlanesRef = useRef<THREE.Object3D[]>([]);
  const lastCacheUpdateRef = useRef(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  // Smooth avatar position to prevent camera wobble
  const smoothedAvatarPositionRef = useRef(new THREE.Vector3(...avatarPosition));

  // Free camera movement settings (Three.js best practices)
  const FREE_CAMERA_SPEED = 20; // Base speed in m/s
  const FREE_CAMERA_SPEED_FAST = 50; // Fast speed (Shift)
  const FREE_CAMERA_SPEED_SLOW = 5; // Slow speed (Ctrl)
  const MOUSE_SENSITIVITY = 0.002; // Mouse look sensitivity
  const ACCELERATION = 50; // Acceleration rate
  const DECELERATION = 30; // Deceleration rate

  // Free camera state
  const freeCameraVelocityRef = useRef(new THREE.Vector3(0, 0, 0)); // Current velocity
  const freeCameraRotationRef = useRef({ pitch: 0, yaw: 0 }); // Camera rotation angles
  const isRightMouseDownRef = useRef(false); // Track right mouse button for mouse look

  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Don't handle camera if clicking on UI elements
      const target = e.target as HTMLElement;
      if (target.closest('.build-tool') || target.closest('.context-menu') ||
          target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
        return;
      }

      // Don't rotate camera if interacting with gizmo or prims
      if ((window as any).__gizmoClicked || (window as any).__primDragging) {
        return;
      }

      // Right mouse button for mouse look in free camera mode
      if (e.button === 2 && cameraModeRef.current === 'free') {
        isRightMouseDownRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      // Left mouse button for camera rotation or panning
      if (e.button === 0) {
        // Alt+Click: Enter free camera mode and focus on clicked point
        if (e.altKey) {
          const canvas = target.closest('canvas');
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycasterRef.current.setFromCamera(mouse, camera);

            // Try to find intersection with scene objects or ground
            const objects: THREE.Object3D[] = [];
            scene.traverse((obj) => {
              if (obj instanceof THREE.Mesh && obj.visible) {
                objects.push(obj);
              }
            });

            const intersections = raycasterRef.current.intersectObjects(objects, true);
            if (intersections.length > 0) {
              // Focus on the clicked object
              freeCameraFocusRef.current = intersections[0].point.clone();
            } else {
              // If no intersection, use a point in front of camera
              const direction = new THREE.Vector3();
              camera.getWorldDirection(direction);
              freeCameraFocusRef.current = camera.position.clone().add(direction.multiplyScalar(10));
            }

            setCameraMode('free');
            cameraStateRef.current.panOffset.set(0, 0, 0); // Reset pan offset
            // Store current camera position for free camera mode
            freeCameraPositionRef.current = camera.position.clone();
            freeCameraVelocityRef.current.set(0, 0, 0); // Reset velocity

            // Initialize rotation from current camera orientation
            const euler = new THREE.Euler().setFromQuaternion(camera.quaternion);
            freeCameraRotationRef.current.pitch = euler.x;
            freeCameraRotationRef.current.yaw = euler.y;

            e.preventDefault();
            return;
          }
        }

        if (e.shiftKey) {
          // Shift+Left drag for panning (most reliable method)
          isPanningRef.current = true;
          panStartedWithMiddleButtonRef.current = false;
        } else {
          // Normal left drag for rotation
          isDraggingRef.current = true;
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
      // Middle mouse button for panning (alternative)
      else if (e.button === 1) {
        isPanningRef.current = true;
        panStartedWithMiddleButtonRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Don't move camera if interacting with gizmo or prims
      if ((window as any).__gizmoClicked || (window as any).__primDragging) {
        return;
      }

      // Handle mouse look in free camera mode (right mouse drag)
      if (cameraModeRef.current === 'free' && isRightMouseDownRef.current) {
        const deltaX = e.clientX - lastMousePosRef.current.x;
        const deltaY = e.clientY - lastMousePosRef.current.y;

        // Update camera rotation (yaw and pitch)
        freeCameraRotationRef.current.yaw -= deltaX * MOUSE_SENSITIVITY;
        freeCameraRotationRef.current.pitch -= deltaY * MOUSE_SENSITIVITY;

        // Clamp pitch to prevent gimbal lock
        freeCameraRotationRef.current.pitch = Math.max(
          -Math.PI / 2 + 0.1,
          Math.min(Math.PI / 2 - 0.1, freeCameraRotationRef.current.pitch)
        );

        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      // Check if Shift is pressed during drag to switch to panning
      if (isDraggingRef.current && e.shiftKey) {
        isDraggingRef.current = false;
        isPanningRef.current = true;
        panStartedWithMiddleButtonRef.current = false;
      }
      // Check if Shift is released during panning (only if it wasn't started with middle mouse)
      if (isPanningRef.current && !e.shiftKey && !panStartedWithMiddleButtonRef.current) {
        // Switch back to rotation if shift was released and it wasn't middle mouse panning
        isPanningRef.current = false;
        isDraggingRef.current = true;
      }

      if (!isDraggingRef.current && !isPanningRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (isPanningRef.current || (isDraggingRef.current && e.shiftKey)) {
        // Pan camera (move camera position, not rotate around avatar)
        // Calculate pan direction based on camera's right and up vectors
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(new THREE.Vector3()); // Forward
        right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

        const panDelta = new THREE.Vector3()
          .addScaledVector(right, -deltaX * PAN_SENSITIVITY)
          .addScaledVector(up, deltaY * PAN_SENSITIVITY);

        cameraStateRef.current.panOffset.add(panDelta);
      } else if (isDraggingRef.current) {
        // Rotate camera around avatar (azimuth)
        cameraStateRef.current.azimuth -= deltaX * ROTATION_SENSITIVITY;

        // Adjust pitch (vertical angle)
        cameraStateRef.current.pitch -= deltaY * PITCH_SENSITIVITY;
        cameraStateRef.current.pitch = Math.max(
          MIN_PITCH,
          Math.min(MAX_PITCH, cameraStateRef.current.pitch)
        );
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isDraggingRef.current = false;
        isPanningRef.current = false; // Also stop panning if it was Ctrl+Shift drag
      }
      if (e.button === 1) {
        isPanningRef.current = false;
      }
      if (e.button === 2) {
        isRightMouseDownRef.current = false;
      }
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        e.preventDefault();
      }
    };

    // Also handle auxclick for middle mouse button (some browsers)
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        // Middle mouse button
        e.preventDefault();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Zoom in/out
      const zoomDelta = e.deltaY * ZOOM_SENSITIVITY;
      cameraStateRef.current.distance += zoomDelta;
      cameraStateRef.current.distance = Math.max(
        MIN_DISTANCE,
        Math.min(MAX_DISTANCE, cameraStateRef.current.distance)
      );
      e.preventDefault();
    };

    // Handle keyboard input for free camera movement
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track modifier keys
      if (e.key === 'Shift' || e.shiftKey) {
        (window as any).__shiftPressed = true;
      }
      if (e.key === 'Control' || e.ctrlKey) {
        (window as any).__ctrlPressed = true;
      }

      // Only handle movement keys in free camera mode
      if (cameraModeRef.current === 'free') {
        const key = e.key.toLowerCase();
        // Track movement keys: WASD, arrows, space (up), q/e or pageup/pagedown (up/down)
        if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "q", "e", "pageup", "pagedown"].includes(key)) {
          keysRef.current.add(key);
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Clear modifier key states
      if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') {
        (window as any).__shiftPressed = false;
      }
      if (e.key === 'Control' || e.key === 'ControlLeft' || e.key === 'ControlRight') {
        (window as any).__ctrlPressed = false;
      }

      if (cameraModeRef.current === 'free') {
        const key = e.key.toLowerCase();
        keysRef.current.delete(key);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      // Reset camera on Escape (Second Life style)
      // Only handle if not typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        if (cameraModeRef.current === 'free') {
          // Exit free camera mode, return to avatar-following
          setCameraMode('avatar');
          freeCameraFocusRef.current = null;
          freeCameraPositionRef.current = null;
          cameraStateRef.current.panOffset.set(0, 0, 0);
          keysRef.current.clear(); // Clear any pressed keys
        } else {
          // Reset camera pan offset
          cameraStateRef.current.panOffset.set(0, 0, 0);
        }
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("auxclick", handleAuxClick);
    window.addEventListener("wheel", handleWheel, { passive: false });
    // Note: contextmenu is handled in World.tsx, not here
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("auxclick", handleAuxClick);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, camera, scene]);

  useFrame((state, delta) => {
    if (!enabled) return;

    const cameraState = cameraStateRef.current;

    // Smooth the avatar position to prevent camera wobble from position updates
    const currentAvatarPos = new THREE.Vector3(...avatarPosition);
    smoothedAvatarPositionRef.current.lerp(currentAvatarPos, 0.3);

    let targetPosition: THREE.Vector3;
    let lookAtPosition: THREE.Vector3;

    if (cameraModeRef.current === 'free') {
      // Free camera mode: FPS-style movement with mouse look
      if (!freeCameraPositionRef.current) {
        freeCameraPositionRef.current = camera.position.clone();
      }

      // Apply mouse look rotation
      const rotation = freeCameraRotationRef.current;
      camera.rotation.order = 'YXZ'; // Yaw (Y), Pitch (X), Roll (Z)
      camera.rotation.y = rotation.yaw;
      camera.rotation.x = rotation.pitch;

      // Handle WASD movement with acceleration/deceleration
      const keys = keysRef.current;
      const shiftPressed = (window as any).__shiftPressed === true;
      const ctrlPressed = (window as any).__ctrlPressed === true;

      // Determine speed based on modifier keys
      let currentSpeed = FREE_CAMERA_SPEED;
      if (shiftPressed) currentSpeed = FREE_CAMERA_SPEED_FAST;
      if (ctrlPressed) currentSpeed = FREE_CAMERA_SPEED_SLOW;

      // Calculate movement direction based on camera orientation
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement horizontal (unless moving up/down)
      forward.normalize();

      const right = new THREE.Vector3();
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      right.y = 0; // Keep movement horizontal
      right.normalize();

      const up = new THREE.Vector3(0, 1, 0);

      // Calculate desired velocity based on input
      const desiredVelocity = new THREE.Vector3();

      // Horizontal movement
      if (keys.has("w") || keys.has("arrowup")) desiredVelocity.add(forward);
      if (keys.has("s") || keys.has("arrowdown")) desiredVelocity.sub(forward);
      if (keys.has("d") || keys.has("arrowright")) desiredVelocity.add(right);
      if (keys.has("a") || keys.has("arrowleft")) desiredVelocity.sub(right);

      // Vertical movement
      if (keys.has(" ") || keys.has("space") || keys.has("pageup")) desiredVelocity.add(up);
      if (keys.has("q") || keys.has("pagedown")) desiredVelocity.sub(up);

      // Normalize desired velocity
      if (desiredVelocity.length() > 0) {
        desiredVelocity.normalize();
        desiredVelocity.multiplyScalar(currentSpeed);
      }

      // Apply acceleration/deceleration for smooth movement
      const velocity = freeCameraVelocityRef.current;
      const acceleration = desiredVelocity.length() > 0 ? ACCELERATION : DECELERATION;
      const speedDiff = desiredVelocity.clone().sub(velocity);
      const accelVector = speedDiff.normalize().multiplyScalar(acceleration * delta);

      if (speedDiff.length() > accelVector.length() * delta) {
        velocity.add(accelVector);
      } else {
        velocity.copy(desiredVelocity);
      }

      // Apply velocity to position
      const movement = velocity.clone().multiplyScalar(delta);
      freeCameraPositionRef.current.add(movement);

      // Set target position and look direction
      targetPosition = freeCameraPositionRef.current.clone();

      // Look direction is already set by camera rotation, so calculate lookAt point
      const lookDirection = new THREE.Vector3();
      camera.getWorldDirection(lookDirection);
      lookAtPosition = targetPosition.clone().add(lookDirection.multiplyScalar(10));
    } else {
      // Avatar-following mode: orbit around avatar
      // Use smoothed avatar position to prevent wobble
      const pos = smoothedAvatarPositionRef.current;

      // Calculate camera position using spherical coordinates
      const horizontalDistance = cameraState.distance * Math.cos(cameraState.pitch);
      const verticalOffset = cameraState.distance * Math.sin(cameraState.pitch);

      // Calculate camera position relative to avatar
      const cameraOffset = new THREE.Vector3(
        Math.sin(cameraState.azimuth) * horizontalDistance,
        verticalOffset + 1.5, // Look at avatar head level
        Math.cos(cameraState.azimuth) * horizontalDistance
      );

      // Add pan offset to camera position
      targetPosition = pos.clone()
        .add(cameraOffset)
        .add(cameraState.panOffset);

      lookAtPosition = pos.clone();
      lookAtPosition.y += 1.5;
    }

    // Only check ground collision in avatar mode when not flying or when close to ground
    // Skip collision check when camera is very close to avatar (likely looking at upper body/head)
    if (cameraModeRef.current === 'avatar' && !isFlying && avatarPosition[1] < 10 && cameraState.distance > 4) {
      // Check if camera would go below ground level
      // Cache plane objects - only update cache every 0.5 seconds
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

      const raycaster = new THREE.Raycaster();
      raycaster.set(targetPosition, new THREE.Vector3(0, -1, 0));
      const intersections = raycaster.intersectObjects(cachedPlanesRef.current, true);
      const GROUND_HEIGHT = 0;
      const minCameraHeight = intersections.length > 0
        ? intersections[0].point.y + 0.5 // Keep camera 0.5m above ground
        : GROUND_HEIGHT + 0.5;

      // Ensure camera doesn't go below ground
      if (targetPosition.y < minCameraHeight) {
        targetPosition.y = minCameraHeight;
        // Adjust pitch to prevent going below
        const adjustedVerticalOffset = targetPosition.y - avatarPosition[1] - 1.5;
        const maxPitch = Math.asin(Math.max(-1, Math.min(1, adjustedVerticalOffset / cameraState.distance)));
        if (cameraState.pitch < maxPitch) {
          cameraState.pitch = maxPitch;
        }
      }
    }

    // Smooth camera movement
    if (cameraModeRef.current === 'free') {
      // In free camera mode, directly set position (movement is already smooth via acceleration)
      camera.position.copy(targetPosition);
      camera.lookAt(lookAtPosition);
    } else {
      // Avatar-following mode: use lerp for smooth following
      // Use delta-based lerp for consistent smoothing regardless of framerate
      const lerpSpeed = isFlying ? 8.0 : 4.0; // Speed in units per second
      const lerpFactor = 1 - Math.exp(-lerpSpeed * delta);
      camera.position.lerp(targetPosition, lerpFactor);

      // Smooth lookAt to prevent wobble
      const currentLookAt = new THREE.Vector3();
      camera.getWorldDirection(currentLookAt);
      currentLookAt.multiplyScalar(10).add(camera.position);
      currentLookAt.lerp(lookAtPosition, lerpFactor);
      camera.lookAt(currentLookAt);
    }
  });
}
