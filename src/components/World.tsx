import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RegionComponent } from "./Region";
import { Avatar } from "./Avatar";
import { Ocean } from "./Ocean";
import { PrimComponent } from "./Prim";
import { BuildTool } from "./BuildTool";
import { Gizmo, type GizmoMode } from "./Gizmo";
import { FPSCounter, StatsUpdaterComponent } from "./FPSCounter";
import { useAvatarController } from "../systems/AvatarController";
import { useCameraController } from "../systems/CameraController";
import { RegionService } from "../services/RegionService";
import { PrimService } from "../services/PrimService";
import { DayNightCycle } from "../systems/DayNightCycle";
import type { Region, AvatarState } from "../types/Region";
import type { Prim } from "../types/Prim";

interface SceneContentProps {
  isDay: boolean;
  prims: Prim[];
  selectedPrim: Prim | null;
  onPrimSelect: (prim: Prim | null) => void;
  avatarPosition: [number, number, number];
  onAvatarPositionChange: (position: [number, number, number]) => void;
  editingPrim: Prim | null;
  gizmoMode: GizmoMode;
  onPrimMove: (primId: number, axis: 'x' | 'y' | 'z', delta: number) => void;
  onPrimRotate: (primId: number, axis: 'x' | 'y' | 'z', delta: number) => void;
  onPrimScale: (primId: number, axis: 'x' | 'y' | 'z', delta: number) => void;
  onDeselectPrim: () => void;
}

function SceneContent({ isDay, prims, selectedPrim, onPrimSelect, avatarPosition, onAvatarPositionChange, editingPrim, gizmoMode, onPrimMove, onPrimRotate, onPrimScale, onDeselectPrim }: SceneContentProps) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const shadowHelperRef = useRef<THREE.CameraHelper | null>(null);
  const { camera, scene } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Calculate initial avatar position based on first region
  const initialPosition = useMemo<[number, number, number]>(() => {
    if (regions.length > 0) {
      // Position avatar at the center of the first region
      return [0, 2, 0]; // Will be updated when regions load
    }
    return [0, 2, 0];
  }, [regions.length]);

  const [avatarState, setAvatarState] = useState<AvatarState>({
    position: initialPosition,
    rotation: 0,
    isFlying: false,
    isWalking: false,
  });

  useAvatarController({
    onStateChange: (newState) => {
      setAvatarState(newState);
      onAvatarPositionChange(newState.position);
    },
    initialPosition: avatarState.position,
  });

  // Second Life-style camera controls
  useCameraController({
    avatarPosition: avatarState.position,
    isFlying: avatarState.isFlying,
    enabled: true,
  });

  // Shadows disabled for performance - removed shadow configuration

  // Handle left-click to deselect prims when clicking empty space (Second Life style)
  useEffect(() => {
    let clickHandled = false;

    const handleClick = (e: MouseEvent) => {
      // Reset flag
      clickHandled = false;

      // Don't handle clicks on UI elements
      const target = e.target as HTMLElement;
      if (target.closest('.build-tool') || target.closest('.context-menu')) {
        return;
      }

      // Only handle left mouse button clicks
      if (e.button !== 0) return;

      const canvas = target.closest('canvas');
      if (!canvas) return;

      // Use a small delay to let PrimComponent onClick handlers fire first
      setTimeout(() => {
        // Check if gizmo was clicked (don't deselect if clicking gizmo)
        if ((window as any).__gizmoClicked) {
          return;
        }

        if (!clickHandled) {
          // No prim was clicked, check what we clicked on
          const rect = canvas.getBoundingClientRect();
          mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

          raycasterRef.current.setFromCamera(mouseRef.current, camera);

          // Collect all meshes for intersection testing
          const allMeshes: THREE.Object3D[] = [];
          const gizmoMeshes: THREE.Object3D[] = [];
          const primMeshes: THREE.Object3D[] = [];
          const regionMeshes: THREE.Object3D[] = [];

          scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              allMeshes.push(object);

              // Check for gizmo meshes (MeshBasicMaterial with gizmo colors)
              if (object.material instanceof THREE.MeshBasicMaterial) {
                const color = object.material.color;
                const isGizmoColor =
                  (color.r > 0.9 && color.g < 0.1 && color.b < 0.1) || // Red
                  (color.r < 0.1 && color.g > 0.9 && color.b < 0.1) || // Green
                  (color.r < 0.1 && color.g < 0.1 && color.b > 0.9) || // Blue
                  (color.r > 0.9 && color.g > 0.9 && color.b < 0.1) || // Yellow
                  (color.r > 0.9 && color.g > 0.9 && color.b > 0.9);   // White
                if (isGizmoColor) {
                  gizmoMeshes.push(object);
                }
              }

              // Check for prim meshes (not gizmo, not region)
              const isPrimMesh = prims.some((prim) => {
                const expectedPos = new THREE.Vector3(prim.position_x, prim.position_y, prim.position_z);
                return object.position.distanceTo(expectedPos) < Math.max(prim.scale_x, prim.scale_y, prim.scale_z) + 0.5;
              });
              if (isPrimMesh && !(object.material instanceof THREE.MeshBasicMaterial)) {
                primMeshes.push(object);
              }

              // Check for region/ground planes (PlaneGeometry)
              if (object.geometry instanceof THREE.PlaneGeometry) {
                regionMeshes.push(object);
              }
            }
          });

          const allIntersections = raycasterRef.current.intersectObjects(allMeshes, true);

          // If no intersections at all, deselect (clicked on sky/empty space)
          if (allIntersections.length === 0) {
            onDeselectPrim();
            return;
          }

          // Check what the first intersection is
          const firstIntersection = allIntersections[0];
          if (!firstIntersection) {
            onDeselectPrim();
            return;
          }

          const clickedObject = firstIntersection.object;

          // Check if clicking on gizmo first (gizmos use MeshBasicMaterial with specific colors)
          if (clickedObject instanceof THREE.Mesh && clickedObject.material instanceof THREE.MeshBasicMaterial) {
            const color = clickedObject.material.color;
            const isGizmoColor =
              (color.r > 0.9 && color.g < 0.1 && color.b < 0.1) || // Red
              (color.r < 0.1 && color.g > 0.9 && color.b < 0.1) || // Green
              (color.r < 0.1 && color.g < 0.1 && color.b > 0.9) || // Blue
              (color.r > 0.9 && color.g > 0.9 && color.b < 0.1) || // Yellow
              (color.r > 0.9 && color.g > 0.9 && color.b > 0.9);   // White
            if (isGizmoColor) {
              return; // Don't deselect if clicking gizmo
            }
          }

          // If clicking on region/ground (PlaneGeometry), always deselect
          // This must come before prim check to ensure region clicks always deselect
          if (clickedObject instanceof THREE.Mesh) {
            const geometry = clickedObject.geometry;
            const isPlaneGeometry =
              geometry instanceof THREE.PlaneGeometry ||
              geometry.constructor.name === 'PlaneGeometry';

            if (isPlaneGeometry) {
              onDeselectPrim();
              return;
            }
          }

          // Don't deselect if clicking on a prim (shouldn't happen since clickHandled should be true, but double-check)
          // Check by geometry type - prims use BoxGeometry, SphereGeometry, etc., NOT PlaneGeometry
          if (clickedObject instanceof THREE.Mesh) {
            const geometry = clickedObject.geometry;
            const isPrimGeometry =
              geometry instanceof THREE.BoxGeometry ||
              geometry instanceof THREE.SphereGeometry ||
              geometry instanceof THREE.CylinderGeometry ||
              geometry instanceof THREE.ConeGeometry ||
              geometry instanceof THREE.TorusGeometry;

            // Only check for prim if it's a prim geometry type
            if (isPrimGeometry && !(clickedObject.material instanceof THREE.MeshBasicMaterial)) {
              // Double-check by position to make sure it's actually a prim
              const isPrimMesh = prims.some((prim) => {
                const expectedPos = new THREE.Vector3(prim.position_x, prim.position_y, prim.position_z);
                return clickedObject.position.distanceTo(expectedPos) < Math.max(prim.scale_x, prim.scale_y, prim.scale_z) + 0.5;
              });
              if (isPrimMesh) {
                return; // Don't deselect if clicking prim
              }
            }
          }

          // Deselect for anything else (region, ocean, etc.)
          // This includes PlaneGeometry (regions) and any other non-prim, non-gizmo objects
          onDeselectPrim();
        }
      }, 10);
    };

    // Mark that a prim was clicked (called from PrimComponent)
    (window as any).__primClicked = () => {
      clickHandled = true;
    };

    // Handle region clicks (called from RegionComponent)
    (window as any).__onRegionClick = () => {
      // Deselect when clicking on region
      onDeselectPrim();
    };

    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      delete (window as any).__primClicked;
      delete (window as any).__onRegionClick;
    };
  }, [camera, scene, onDeselectPrim]);


  useEffect(() => {
    async function loadRegions() {
      try {
        const loadedRegions = await RegionService.getRegions();
        console.log("Loaded regions:", loadedRegions);
        setRegions(loadedRegions);

        // Position avatar on first region (center of the region)
        if (loadedRegions.length > 0) {
          // Calculate the position of the first region in the grid
          const gridSize = Math.ceil(Math.sqrt(loadedRegions.length));
          const row = 0; // First region
          const col = 0; // First region
          const spacing = 300; // Space between regions
          // Region position is already the center of the plane
          const regionX = (col - gridSize / 2) * spacing;
          const regionZ = (row - gridSize / 2) * spacing;
          const regionPosition: [number, number, number] = [
            regionX, // X position of region center
            2.2, // 2 meters above region (which is 0.2m above water)
            regionZ, // Z position of region center
          ];

          console.log("Positioning avatar at region center:", regionPosition);
          setAvatarState(prev => ({
            ...prev,
            position: regionPosition,
          }));
          onAvatarPositionChange(regionPosition);
        }
      } catch (error) {
        console.error("Failed to load regions:", error);
        // Set empty array on error so we can still render the scene
        setRegions([]);
      } finally {
        setLoading(false);
      }
    }

    loadRegions();
  }, []);

  if (loading) {
    return null;
  }

  return (
    <>
      {/* Stats updater - must be inside Canvas for useFrame */}
      <StatsUpdaterComponent />

      {/* Day/Night Cycle */}
      <DayNightCycle
        sunLightRef={sunLightRef}
        ambientLightRef={ambientLightRef}
        isDay={isDay}
      />

      {/* Sun - Main directional light (shadows disabled for performance) */}
      {/* Initial position matches day mode sun position calculated from sunAngle */}
      <directionalLight
        ref={sunLightRef}
        position={[50, 86.6, 0]}
        intensity={1.0}
        castShadow={false}
      />

      {/* Ambient light for overall illumination (intensity updated by DayNightCycle) */}
      <ambientLight ref={ambientLightRef} intensity={0.15} />

      {/* Regions */}
      {regions.length > 0 ? (
        regions.map((region, index) => {
          // Arrange regions in a grid (simple layout for now)
          const gridSize = Math.ceil(Math.sqrt(regions.length));
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const spacing = 300; // Space between regions
          const position: [number, number, number] = [
            (col - gridSize / 2) * spacing,
            0.2, // Slightly above water level
            (row - gridSize / 2) * spacing,
          ];

          return (
            <RegionComponent key={region.id} region={region} position={position} />
          );
        })
      ) : (
        // Show a default region at origin if none loaded
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
          <planeGeometry args={[256, 256]} />
          <meshStandardMaterial color="#cccccc" />
        </mesh>
      )}

      {/* Ocean - renders after regions so it's visible around edges */}
      {/* <Ocean isDay={isDay} sunLightRef={sunLightRef} /> */}

      {/* Prims */}
      {prims.map((prim) => (
        <PrimComponent
          key={prim.id}
          prim={prim}
          selected={selectedPrim?.id === prim.id}
          onSelect={() => onPrimSelect(prim)}
          // onRightClick is handled globally by contextmenu handler
        />
      ))}

      {/* Gizmo for editing */}
      {editingPrim && (() => {
        const currentPrim = prims.find(p => p.id === editingPrim.id) || editingPrim;
        return (
          <Gizmo
            position={[currentPrim.position_x, currentPrim.position_y, currentPrim.position_z]}
            primScale={[currentPrim.scale_x, currentPrim.scale_y, currentPrim.scale_z]}
            mode={gizmoMode}
            onMove={(axis, delta) => onPrimMove(editingPrim.id, axis, delta)}
            onRotate={(axis, delta) => onPrimRotate(editingPrim.id, axis, delta)}
            onScale={(axis, delta) => onPrimScale(editingPrim.id, axis, delta)}
            enabled={true}
          />
        );
      })()}

      {/* Avatar */}
      <Avatar state={avatarState} />
    </>
  );
}

export function World({ isDay }: { isDay: boolean }) {
  const [selectedPrim, setSelectedPrim] = useState<Prim | null>(null);
  const [prims, setPrims] = useState<Prim[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [avatarPosition, setAvatarPosition] = useState<[number, number, number]>([0, 2, 0]);
  const [editingPrim, setEditingPrim] = useState<Prim | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');

  const loadPrims = async (regionId: number) => {
    try {
      const loadedPrims = await PrimService.getPrims(regionId);
      setPrims(loadedPrims);
    } catch (error) {
      console.error("Failed to load prims:", error);
      setPrims([]);
    }
  };

  useEffect(() => {
    async function loadRegions() {
      try {
        const loadedRegions = await RegionService.getRegions();
        setRegions(loadedRegions);
        if (loadedRegions.length > 0 && loadedRegions[0]) {
          await loadPrims(loadedRegions[0].id);
        }
      } catch (error) {
        console.error("Failed to load regions:", error);
        setRegions([]);
      }
    }
    loadRegions();
  }, []);

  const handlePrimsChange = () => {
    if (regions.length > 0 && regions[0]) {
      loadPrims(regions[0].id);
    }
  };


  const saveTimeoutRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<Map<number, Partial<Prim>>>(new Map());

  // Keyboard shortcuts for gizmo mode and focus (Second Life style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't change mode if typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 't' || key === '1') {
        setGizmoMode('translate');
        e.preventDefault();
      } else if (key === 'r' || key === '2') {
        setGizmoMode('rotate');
        e.preventDefault();
      } else if (key === 's' || key === '3') {
        setGizmoMode('scale');
        e.preventDefault();
      } else if (key === 'h' && selectedPrim) {
        // Focus on selection (H key)
        focusOnPrim(selectedPrim);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPrim]);

  // Focus camera on a prim
  const focusOnPrim = (prim: Prim) => {
    // This will be handled by the camera controller
    // For now, we'll move the avatar near the prim
    const newPosition: [number, number, number] = [
      prim.position_x,
      Math.max(prim.position_y + prim.scale_y / 2 + 2, 2),
      prim.position_z + 5
    ];
    setAvatarPosition(newPosition);
  };

  // Handle real-time prim property updates
  const handlePrimPropertyUpdate = (id: number, updates: Partial<Prim>) => {
    // Update local state immediately
    setPrims(prevPrims => prevPrims.map(p =>
      p.id === id ? { ...p, ...updates } : p
    ));

    // Update editing prim if it's the one being updated
    if (editingPrim?.id === id) {
      setEditingPrim({ ...editingPrim, ...updates });
    }

    // Update selected prim if it's the one being updated
    if (selectedPrim?.id === id) {
      setSelectedPrim({ ...selectedPrim, ...updates });
    }
  };

  const handlePrimMove = (primId: number, axis: 'x' | 'y' | 'z', delta: number) => {
    const prim = prims.find(p => p.id === primId);
    if (!prim) return;

    // Update local state immediately for responsive UI
    const updates: Partial<Prim> = {};
    if (axis === 'x') updates.position_x = prim.position_x + delta;
    if (axis === 'y') updates.position_y = prim.position_y + delta;
    if (axis === 'z') updates.position_z = prim.position_z + delta;

    // Update prims array
    setPrims(prevPrims => prevPrims.map(p =>
      p.id === primId ? { ...p, ...updates } : p
    ));

    // Update editing prim if it's the one being moved
    if (editingPrim?.id === primId) {
      setEditingPrim({ ...editingPrim, ...updates });
    }

    // Accumulate updates for debounced save
    const currentUpdates = pendingUpdatesRef.current.get(primId) || {};
    pendingUpdatesRef.current.set(primId, { ...currentUpdates, ...updates });

    // Clear existing timeout
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce API call - save 300ms after user stops dragging
    saveTimeoutRef.current = window.setTimeout(async () => {
      const updatesToSave = pendingUpdatesRef.current.get(primId);
      if (updatesToSave) {
        try {
          await PrimService.updatePrim(primId, updatesToSave);
          pendingUpdatesRef.current.delete(primId);
        } catch (error) {
          console.error("Failed to update prim position:", error);
          // Reload prims on error to revert
          if (regions.length > 0 && regions[0]) {
            await loadPrims(regions[0].id);
          }
        }
      }
    }, 300);
  };

  const handlePrimRotate = (primId: number, axis: 'x' | 'y' | 'z', delta: number) => {
    const prim = prims.find(p => p.id === primId);
    if (!prim) return;

    const updates: Partial<Prim> = {};
    if (axis === 'x') updates.rotation_x = prim.rotation_x + delta;
    if (axis === 'y') updates.rotation_y = prim.rotation_y + delta;
    if (axis === 'z') updates.rotation_z = prim.rotation_z + delta;

    setPrims(prevPrims => prevPrims.map(p =>
      p.id === primId ? { ...p, ...updates } : p
    ));

    if (editingPrim?.id === primId) {
      setEditingPrim({ ...editingPrim, ...updates });
    }

    const currentUpdates = pendingUpdatesRef.current.get(primId) || {};
    pendingUpdatesRef.current.set(primId, { ...currentUpdates, ...updates });

    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const updatesToSave = pendingUpdatesRef.current.get(primId);
      if (updatesToSave) {
        try {
          await PrimService.updatePrim(primId, updatesToSave);
          pendingUpdatesRef.current.delete(primId);
        } catch (error) {
          console.error("Failed to update prim rotation:", error);
          if (regions.length > 0 && regions[0]) {
            await loadPrims(regions[0].id);
          }
        }
      }
    }, 300);
  };

  const handlePrimScale = (primId: number, axis: 'x' | 'y' | 'z', delta: number) => {
    const prim = prims.find(p => p.id === primId);
    if (!prim) return;

    const updates: Partial<Prim> = {};
    if (axis === 'x') updates.scale_x = Math.max(0.1, prim.scale_x + delta);
    if (axis === 'y') updates.scale_y = Math.max(0.1, prim.scale_y + delta);
    if (axis === 'z') updates.scale_z = Math.max(0.1, prim.scale_z + delta);

    setPrims(prevPrims => prevPrims.map(p =>
      p.id === primId ? { ...p, ...updates } : p
    ));

    if (editingPrim?.id === primId) {
      setEditingPrim({ ...editingPrim, ...updates });
    }

    const currentUpdates = pendingUpdatesRef.current.get(primId) || {};
    pendingUpdatesRef.current.set(primId, { ...currentUpdates, ...updates });

    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const updatesToSave = pendingUpdatesRef.current.get(primId);
      if (updatesToSave) {
        try {
          await PrimService.updatePrim(primId, updatesToSave);
          pendingUpdatesRef.current.delete(primId);
        } catch (error) {
          console.error("Failed to update prim scale:", error);
          if (regions.length > 0 && regions[0]) {
            await loadPrims(regions[0].id);
          }
        }
      }
    }, 300);
  };

  return (
    <>
      <FPSCounter />
      <Canvas
        camera={{ position: [0, 5, 10], fov: 75 }}
        style={{ width: "100%", height: "100vh" }}
        gl={{
          antialias: false, // Disable antialiasing for better performance
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
        }}
        dpr={1} // Fixed DPR for consistent performance
        shadows={false} // Disable shadows for better performance
        performance={{ min: 0.5 }} // Allow frame rate to drop to 30fps before degrading
        onCreated={({ gl, scene }) => {
          // Optimize renderer settings
          gl.shadowMap.enabled = false; // Shadows disabled for performance
          gl.setPixelRatio(1); // Force pixel ratio to 1

          // Enable frustum culling (Three.js does this by default, but ensure it's enabled)
          // This automatically hides objects outside the camera view
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              // Ensure frustum culling is enabled (default)
              object.frustumCulled = true;
            }
          });
        }}
      >
        <Suspense fallback={null}>
          <SceneContent
            isDay={isDay}
            prims={prims}
            selectedPrim={selectedPrim}
            onPrimSelect={(prim) => {
              setSelectedPrim(prim);
              // When selecting a prim, also set it as editingPrim for immediate gizmo update
              if (prim) {
                setEditingPrim(prim);
              } else {
                setEditingPrim(null);
              }
            }}
            avatarPosition={avatarPosition}
            onAvatarPositionChange={setAvatarPosition}
            editingPrim={editingPrim}
            gizmoMode={gizmoMode}
            onPrimMove={handlePrimMove}
            onPrimRotate={handlePrimRotate}
            onPrimScale={handlePrimScale}
            onDeselectPrim={() => {
              setSelectedPrim(null);
              setEditingPrim(null);
            }}
          />
        </Suspense>
      </Canvas>
      {regions.length > 0 && regions[0] && (
        <BuildTool
          region={regions[0]}
          selectedPrim={selectedPrim}
          onPrimSelect={(prim) => {
            setSelectedPrim(prim);
            // When selecting a prim, also set it as editingPrim for immediate gizmo update
            if (prim) {
              setEditingPrim(prim);
            } else {
              setEditingPrim(null);
            }
          }}
          onPrimsChange={handlePrimsChange}
          avatarPosition={avatarPosition}
          onEditingStateChange={(isEditing, prim) => {
            if (isEditing && prim) {
              // Always update editingPrim when editing starts, even if it's the same prim
              // This ensures the gizmo and form update when switching between prims
              setEditingPrim(prim);
            } else {
              setEditingPrim(null);
              // Reload prims when editing ends to ensure sync
              if (regions.length > 0 && regions[0]) {
                loadPrims(regions[0].id);
              }
            }
          }}
          gizmoMode={gizmoMode}
          editingPrim={editingPrim}
          onUpdatePrim={handlePrimPropertyUpdate}
        />
      )}
    </>
  );
}
