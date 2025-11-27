import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type GizmoMode = 'translate' | 'rotate' | 'scale';

interface GizmoProps {
  position: [number, number, number];
  mode: GizmoMode;
  primScale?: [number, number, number];
  onMove?: (axis: 'x' | 'y' | 'z', delta: number) => void;
  onRotate?: (axis: 'x' | 'y' | 'z', delta: number) => void;
  onScale?: (axis: 'x' | 'y' | 'z', delta: number) => void;
  enabled: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const ARROW_LENGTH = 1.5;
const ARROW_RADIUS = 0.06;
const CONE_HEIGHT = 0.3;
const CONE_RADIUS = 0.12;
const RING_RADIUS = 1.2;
const RING_THICKNESS = 0.04;
const SCALE_BOX_SIZE = 0.2;

export function Gizmo({ position, mode, primScale = [1, 1, 1], onMove, onRotate, onScale, enabled, onInteractionStart, onInteractionEnd }: GizmoProps) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredAxis, setHoveredAxis] = useState<'x' | 'y' | 'z' | null>(null);
  const [draggingAxis, setDraggingAxis] = useState<'x' | 'y' | 'z' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; worldPos: THREE.Vector3 } | null>(null);

  // Calculate scale based on camera distance (keep gizmo size consistent, not tied to prim size)
  useFrame(() => {
    if (!groupRef.current || !camera) return;
    
    // Scale gizmo based on camera distance to keep it visible but not too large
    const distance = camera.position.distanceTo(new THREE.Vector3(...position));
    const distanceScale = Math.max(0.5, Math.min(1.2, distance / 12));
    
    // Keep gizmo size relatively constant, independent of prim scale
    groupRef.current.scale.setScalar(distanceScale);
  });

  // Handle mouse move for dragging
  useEffect(() => {
    if (!draggingAxis || !dragStart) return;

    // Mark that we're dragging a prim to prevent camera rotation
    (window as any).__primDragging = true;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      const distance = camera.position.distanceTo(new THREE.Vector3(...position));
      const sensitivity = distance * 0.002;

      let delta = 0;
      if (draggingAxis === 'x') {
        delta = deltaX * sensitivity;
      } else if (draggingAxis === 'y') {
        delta = -deltaY * sensitivity;
      } else if (draggingAxis === 'z') {
        delta = -deltaY * sensitivity;
      }

      if (mode === 'translate' && onMove) {
        onMove(draggingAxis, delta);
      } else if (mode === 'rotate' && onRotate) {
        // Rotation sensitivity (radians)
        onRotate(draggingAxis, delta * 0.5);
      } else if (mode === 'scale' && onScale) {
        // Scale sensitivity (multiplier)
        onScale(draggingAxis, delta * 0.1);
      }

      setDragStart({ ...dragStart, x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setDraggingAxis(null);
      setDragStart(null);
      onInteractionEnd?.();
      // Clear the flags after a short delay
      setTimeout(() => {
        delete (window as any).__gizmoClicked;
        delete (window as any).__primDragging;
      }, 100);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      delete (window as any).__primDragging;
    };
  }, [draggingAxis, dragStart, camera, mode, onMove, onRotate, onScale, position, onInteractionEnd]);

  const handlePointerDown = (e: React.PointerEvent, axis: 'x' | 'y' | 'z') => {
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    setDraggingAxis(axis);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      worldPos: new THREE.Vector3(...position),
    });
    onInteractionStart?.();
    // Mark that gizmo was clicked to prevent deselection
    (window as any).__gizmoClicked = true;
  };

  const handlePointerOver = (e: React.PointerEvent, axis: 'x' | 'y' | 'z') => {
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    if (!draggingAxis) {
      setHoveredAxis(axis);
    }
  };

  const handlePointerOut = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    if (!draggingAxis) {
      setHoveredAxis(null);
    }
  };

  if (!enabled) return null;

  const getAxisColor = (axis: 'x' | 'y' | 'z') => {
    if (draggingAxis === axis) return '#ffff00'; // Bright yellow when dragging
    if (hoveredAxis === axis) return '#ffffff'; // White when hovered
    if (axis === 'x') return '#ff0000'; // Bright red
    if (axis === 'y') return '#00ff00'; // Bright green
    return '#0080ff'; // Bright blue
  };

  // Ring geometry for rotation mode
  const ringGeometry = useMemo(() => {
    return new THREE.TorusGeometry(RING_RADIUS, RING_THICKNESS, 8, 32);
  }, []);

  // Box geometry for scale mode
  const boxGeometry = useMemo(() => {
    return new THREE.BoxGeometry(SCALE_BOX_SIZE, SCALE_BOX_SIZE, SCALE_BOX_SIZE);
  }, []);

  return (
    <group ref={groupRef} position={position}>
      {mode === 'translate' && (
        <>
          {/* X Axis - Red Arrow */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'x')}
            onPointerOver={(e) => handlePointerOver(e, 'x')}
            onPointerOut={handlePointerOut}
          >
            <mesh rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[ARROW_RADIUS, ARROW_RADIUS, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('x')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={[ARROW_LENGTH, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[CONE_RADIUS, CONE_HEIGHT, 8]} />
              <meshBasicMaterial color={getAxisColor('x')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Y Axis - Green Arrow */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'y')}
            onPointerOver={(e) => handlePointerOver(e, 'y')}
            onPointerOut={handlePointerOut}
          >
            <mesh>
              <cylinderGeometry args={[ARROW_RADIUS, ARROW_RADIUS, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('y')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={[0, ARROW_LENGTH, 0]}>
              <coneGeometry args={[CONE_RADIUS, CONE_HEIGHT, 8]} />
              <meshBasicMaterial color={getAxisColor('y')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Z Axis - Blue Arrow */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'z')}
            onPointerOver={(e) => handlePointerOver(e, 'z')}
            onPointerOut={handlePointerOut}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[ARROW_RADIUS, ARROW_RADIUS, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('z')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, ARROW_LENGTH]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[CONE_RADIUS, CONE_HEIGHT, 8]} />
              <meshBasicMaterial color={getAxisColor('z')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}

      {mode === 'rotate' && (
        <>
          {/* X Axis - Red Ring */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'x')}
            onPointerOver={(e) => handlePointerOver(e, 'x')}
            onPointerOut={handlePointerOut}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} geometry={ringGeometry}>
              <meshBasicMaterial color={getAxisColor('x')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Y Axis - Green Ring */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'y')}
            onPointerOver={(e) => handlePointerOver(e, 'y')}
            onPointerOut={handlePointerOut}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]} geometry={ringGeometry}>
              <meshBasicMaterial color={getAxisColor('y')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Z Axis - Blue Ring */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'z')}
            onPointerOver={(e) => handlePointerOver(e, 'z')}
            onPointerOut={handlePointerOut}
          >
            <mesh geometry={ringGeometry}>
              <meshBasicMaterial color={getAxisColor('z')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}

      {mode === 'scale' && (
        <>
          {/* X Axis - Red Box */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'x')}
            onPointerOver={(e) => handlePointerOver(e, 'x')}
            onPointerOut={handlePointerOut}
          >
            <mesh position={[ARROW_LENGTH, 0, 0]} geometry={boxGeometry}>
              <meshBasicMaterial color={getAxisColor('x')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[ARROW_RADIUS * 0.5, ARROW_RADIUS * 0.5, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('x')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Y Axis - Green Box */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'y')}
            onPointerOver={(e) => handlePointerOver(e, 'y')}
            onPointerOut={handlePointerOut}
          >
            <mesh position={[0, ARROW_LENGTH, 0]} geometry={boxGeometry}>
              <meshBasicMaterial color={getAxisColor('y')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[ARROW_RADIUS * 0.5, ARROW_RADIUS * 0.5, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('y')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>

          {/* Z Axis - Blue Box */}
          <group
            onPointerDown={(e) => handlePointerDown(e, 'z')}
            onPointerOver={(e) => handlePointerOver(e, 'z')}
            onPointerOut={handlePointerOut}
          >
            <mesh position={[0, 0, ARROW_LENGTH]} rotation={[Math.PI / 2, 0, 0]} geometry={boxGeometry}>
              <meshBasicMaterial color={getAxisColor('z')} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[ARROW_RADIUS * 0.5, ARROW_RADIUS * 0.5, ARROW_LENGTH, 8]} />
              <meshBasicMaterial color={getAxisColor('z')} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
