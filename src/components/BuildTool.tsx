import { useState, useEffect, useRef } from "react";
import { PrimService } from "../services/PrimService";
import type { Prim, PrimShape, PrimCreateRequest, PrimUpdateRequest } from "../types/Prim";
import type { Region } from "../types/Region";
import type { GizmoMode } from "./Gizmo";

interface BuildToolProps {
  region: Region;
  selectedPrim: Prim | null;
  onPrimSelect: (prim: Prim | null) => void;
  onPrimsChange: () => void;
  avatarPosition: [number, number, number];
  onEditingStateChange?: (isEditing: boolean, prim: Prim | null) => void;
  gizmoMode?: GizmoMode;
  editingPrim?: Prim | null;
  onUpdatePrim?: (id: number, updates: Partial<Prim>) => void;
}

const PRIM_SHAPES: PrimShape[] = ["box", "sphere", "cylinder", "cone", "torus"];

export function BuildTool({
  region,
  selectedPrim,
  onPrimSelect,
  onPrimsChange,
  avatarPosition,
  onEditingStateChange,
  gizmoMode = 'translate',
  editingPrim: externalEditingPrim,
  onUpdatePrim
}: BuildToolProps) {
  const [prims, setPrims] = useState<Prim[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuildToolOpen, setIsBuildToolOpen] = useState(true);
  const [createMode, setCreateMode] = useState(false);
  const [editingPrim, setEditingPrim] = useState<Prim | null>(null);
  const updateTimeoutRef = useRef<number | null>(null);
  const createModeRef = useRef(false);

  // Auto-edit when prim is selected (Second Life style)
  useEffect(() => {
    if (selectedPrim && !externalEditingPrim) {
      // Find the latest version of the prim from the prims array
      const latestPrim = prims.find(p => p.id === selectedPrim.id) || selectedPrim;
      // Automatically enter edit mode when a prim is selected
      setEditingPrim(latestPrim);
      setCreateMode(false);
      createModeRef.current = false;
      onEditingStateChange?.(true, latestPrim);
    } else if (!selectedPrim && !externalEditingPrim && !createModeRef.current) {
      // Only clear editingPrim and createMode if we're not explicitly in create mode
      setEditingPrim(null);
      setCreateMode(false);
      onEditingStateChange?.(false, null);
    }
  }, [selectedPrim, externalEditingPrim, prims, onEditingStateChange]);

  // Sync with external editingPrim prop (from context menu "Edit Prim" or direct selection)
  useEffect(() => {
    if (externalEditingPrim) {
      // Find the latest version of the prim from the prims array
      const latestPrim = prims.find(p => p.id === externalEditingPrim.id) || externalEditingPrim;
      // Always update to ensure we have the latest data
      setEditingPrim(latestPrim);
      setCreateMode(false);
      createModeRef.current = false;
      onEditingStateChange?.(true, latestPrim);
    } else if (externalEditingPrim === null && !selectedPrim && !createModeRef.current) {
      setEditingPrim(null);
      setCreateMode(false);
      onEditingStateChange?.(false, null);
    }
  }, [externalEditingPrim, selectedPrim, prims, onEditingStateChange]);

  // Update editingPrim when prims array updates (to get latest data for the currently editing prim)
  useEffect(() => {
    if (editingPrim && prims.length > 0) {
      const latestPrim = prims.find(p => p.id === editingPrim.id);
      if (latestPrim) {
        // Always update to latest data to keep form and gizmo in sync
        setEditingPrim(latestPrim);
      }
    }
  }, [prims]);

  const loadPrims = async () => {
    try {
      setLoading(true);
      const loadedPrims = await PrimService.getPrims(region.id);
      setPrims(loadedPrims);
    } catch (error) {
      console.error("Failed to load prims:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrims();
  }, [region.id]);

  // Calculate default create position near avatar (in front and slightly above)
  const getDefaultCreatePosition = (): [number, number, number] => {
    // Place prim 2 units in front of avatar, at avatar height + 0.5
    return [avatarPosition[0], avatarPosition[1] + 0.5, avatarPosition[2] + 2];
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl+B to toggle build tool
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        setIsBuildToolOpen(prev => !prev);
        e.preventDefault();
      }
      // H to focus on selection (handled in World component)
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreatePrim = async (data: PrimCreateRequest) => {
    try {
      await PrimService.createPrim({ ...data, region_id: region.id });
      await loadPrims();
      createModeRef.current = false;
      setCreateMode(false);
      onPrimsChange();
    } catch (error) {
      console.error("Failed to create prim:", error);
      alert(`Failed to create prim: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Real-time update handler (debounced)
  const handlePropertyChange = (updates: Partial<Prim>) => {
    if (!editingPrim) return;

    // Update local state immediately for responsive UI
    const updatedPrim = { ...editingPrim, ...updates };
    setEditingPrim(updatedPrim);
    onUpdatePrim?.(editingPrim.id, updates);

    // Debounce API call
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = window.setTimeout(async () => {
      try {
        await PrimService.updatePrim(editingPrim.id, updates);
        await loadPrims();
      } catch (error) {
        console.error("Failed to update prim:", error);
      }
    }, 500);
  };

  const handleDeletePrim = async (id: number) => {
    if (!confirm("Are you sure you want to delete this prim?")) {
      return;
    }
    try {
      await PrimService.deletePrim(id);
      await loadPrims();
      if (selectedPrim?.id === id) {
        onPrimSelect(null);
        setEditingPrim(null);
      }
      onPrimsChange();
    } catch (error) {
      console.error("Failed to delete prim:", error);
      alert(`Failed to delete prim: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!isBuildToolOpen) {
    return (
      <div style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 1000,
      }}>
        <button
          onClick={() => setIsBuildToolOpen(true)}
          style={{
            padding: "8px 16px",
            backgroundColor: "#4a90e2",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Build Tool (Ctrl+B)
        </button>
      </div>
    );
  }

  return (
    <div className="build-tool" style={{
      position: "absolute",
      top: "10px",
      right: "10px",
      width: "320px",
      backgroundColor: "rgba(30, 30, 30, 0.95)",
      color: "white",
      borderRadius: "4px",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      maxHeight: "85vh",
      overflowY: "auto",
      zIndex: 1000,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>Build</h2>
        <button
          onClick={() => setIsBuildToolOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "18px",
            padding: "0 8px",
          }}
        >
          ×
        </button>
      </div>

      {/* Gizmo Mode Indicator */}
      {editingPrim && (
        <div style={{
          padding: "8px 10px",
          backgroundColor: "rgba(74, 144, 226, 0.2)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          fontSize: "11px"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Gizmo Mode:</div>
          <div style={{ display: "flex", gap: "4px" }}>
            <span style={{
              padding: "2px 6px",
              borderRadius: "2px",
              backgroundColor: gizmoMode === 'translate' ? "rgba(255, 255, 255, 0.3)" : "transparent"
            }}>
              T/1: Move
            </span>
            <span style={{
              padding: "2px 6px",
              borderRadius: "2px",
              backgroundColor: gizmoMode === 'rotate' ? "rgba(255, 255, 255, 0.3)" : "transparent"
            }}>
              R/2: Rotate
            </span>
            <span style={{
              padding: "2px 6px",
              borderRadius: "2px",
              backgroundColor: gizmoMode === 'scale' ? "rgba(255, 255, 255, 0.3)" : "transparent"
            }}>
              S/3: Scale
            </span>
          </div>
        </div>
      )}

      {/* Create Mode */}
      {createMode && !editingPrim && (
        <div style={{ padding: "10px" }}>
          <div style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Create Prim</strong>
            <button
              onClick={() => {
                createModeRef.current = false;
                setCreateMode(false);
              }}
              style={{
                padding: "4px 8px",
                backgroundColor: "#666",
                color: "white",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Cancel
            </button>
          </div>
          <PrimForm
            initialPosition={getDefaultCreatePosition()}
            onSubmit={(data) => handleCreatePrim(data)}
            onCancel={() => {
              createModeRef.current = false;
              setCreateMode(false);
            }}
          />
        </div>
      )}

      {/* Edit Mode - Auto-shown when prim is selected */}
      {editingPrim && (
        <div style={{ padding: "10px" }}>
          <div style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
            <strong>Edit: {editingPrim.name}</strong>
            <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => {
                createModeRef.current = true;
                onPrimSelect(null);
                setCreateMode(true);
              }}
              style={{
                padding: "4px 8px",
                backgroundColor: "#4a90e2",
                color: "white",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              New Prim
            </button>
              <button
                onClick={() => onPrimSelect(null)}
                style={{
                  padding: "4px 8px",
                  backgroundColor: "#666",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Deselect
              </button>
              <button
                onClick={() => handleDeletePrim(editingPrim.id)}
                style={{
                  padding: "4px 8px",
                  backgroundColor: "#e24a4a",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Delete
              </button>
            </div>
          </div>
          <PrimEditForm
            prim={editingPrim}
            onPropertyChange={handlePropertyChange}
          />
        </div>
      )}

      {/* No Selection */}
      {!editingPrim && !createMode && (
        <div style={{ padding: "10px" }}>
          <div style={{ marginBottom: "10px", color: "#aaa", fontSize: "12px" }}>
            Select a prim to edit, or click "Create Prim" to add a new one.
          </div>
          <button
            onClick={() => {
              createModeRef.current = true;
              onPrimSelect(null);
              setCreateMode(true);
            }}
            style={{
              width: "100%",
              padding: "8px",
              backgroundColor: "#4a90e2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Create Prim
          </button>
        </div>
      )}

      {/* Prim List */}
      <div style={{
        marginTop: "10px",
        padding: "10px",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
      }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "bold" }}>
          Prims ({prims.length})
        </h3>
        {loading ? (
          <div style={{ color: "#888", fontSize: "12px" }}>Loading...</div>
        ) : prims.length === 0 ? (
          <div style={{ color: "#888", fontSize: "12px" }}>No prims yet</div>
        ) : (
          <div style={{ maxHeight: "200px", overflowY: "auto" }}>
            {prims.map((prim) => (
              <div
                key={prim.id}
                onClick={() => onPrimSelect(prim)}
                style={{
                  padding: "6px 8px",
                  marginBottom: "4px",
                  backgroundColor: selectedPrim?.id === prim.id ? "rgba(74, 144, 226, 0.4)" : "rgba(255, 255, 255, 0.05)",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "12px",
                  border: selectedPrim?.id === prim.id ? "1px solid rgba(74, 144, 226, 0.6)" : "1px solid transparent",
                }}
              >
                <div style={{ fontWeight: "bold" }}>{prim.name}</div>
                <div style={{ color: "#aaa", fontSize: "11px" }}>{prim.shape}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PrimFormProps {
  prim?: Prim;
  initialPosition?: [number, number, number];
  onSubmit: (data: PrimCreateRequest | PrimUpdateRequest) => void;
  onCancel: () => void;
}

function PrimForm({ prim, initialPosition, onSubmit, onCancel }: PrimFormProps) {
  const [formData, setFormData] = useState({
    name: prim?.name || "Prim",
    shape: (prim?.shape || "box") as PrimShape,
    position_x: prim?.position_x ?? initialPosition?.[0] ?? 0,
    position_y: prim?.position_y ?? initialPosition?.[1] ?? 0,
    position_z: prim?.position_z ?? initialPosition?.[2] ?? 0,
    rotation_x: prim?.rotation_x ?? 0,
    rotation_y: prim?.rotation_y ?? 0,
    rotation_z: prim?.rotation_z ?? 0,
    scale_x: prim?.scale_x ?? 1,
    scale_y: prim?.scale_y ?? 1,
    scale_z: prim?.scale_z ?? 1,
    color_r: prim?.color_r ?? 0.5,
    color_g: prim?.color_g ?? 0.5,
    color_b: prim?.color_b ?? 0.5,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputStyle = {
    width: "100%",
    padding: "4px 6px",
    marginBottom: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "white",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "3px",
    fontSize: "12px",
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Shape</label>
        <select
          value={formData.shape}
          onChange={(e) => setFormData({ ...formData, shape: e.target.value as PrimShape })}
          style={inputStyle}
        >
          {PRIM_SHAPES.map((shape) => (
            <option key={shape} value={shape} style={{ backgroundColor: "#1e1e1e", color: "white" }}>
              {shape.charAt(0).toUpperCase() + shape.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Position</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            value={formData.position_x}
            onChange={(e) => setFormData({ ...formData, position_x: parseFloat(e.target.value) || 0 })}
            placeholder="X"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.position_y}
            onChange={(e) => setFormData({ ...formData, position_y: parseFloat(e.target.value) || 0 })}
            placeholder="Y"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.position_z}
            onChange={(e) => setFormData({ ...formData, position_z: parseFloat(e.target.value) || 0 })}
            placeholder="Z"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Size</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_x}
            onChange={(e) => setFormData({ ...formData, scale_x: parseFloat(e.target.value) || 1 })}
            placeholder="X"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_y}
            onChange={(e) => setFormData({ ...formData, scale_y: parseFloat(e.target.value) || 1 })}
            placeholder="Y"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_z}
            onChange={(e) => setFormData({ ...formData, scale_z: parseFloat(e.target.value) || 1 })}
            placeholder="Z"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Color</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_r}
            onChange={(e) => setFormData({ ...formData, color_r: parseFloat(e.target.value) || 0 })}
            placeholder="R"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_g}
            onChange={(e) => setFormData({ ...formData, color_g: parseFloat(e.target.value) || 0 })}
            placeholder="G"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_b}
            onChange={(e) => setFormData({ ...formData, color_b: parseFloat(e.target.value) || 0 })}
            placeholder="B"
            style={inputStyle}
          />
        </div>
        <div style={{
          width: "100%",
          height: "30px",
          backgroundColor: `rgb(${Math.round(formData.color_r * 255)}, ${Math.round(formData.color_g * 255)}, ${Math.round(formData.color_b * 255)})`,
          borderRadius: "3px",
          marginTop: "4px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }} />
      </div>

      <div style={{ display: "flex", gap: "5px", marginTop: "10px" }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: "6px",
            backgroundColor: "#4a90e2",
            color: "white",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          {prim ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "6px",
            backgroundColor: "#666",
            color: "white",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface PrimEditFormProps {
  prim: Prim;
  onPropertyChange: (updates: Partial<Prim>) => void;
}

function PrimEditForm({ prim, onPropertyChange }: PrimEditFormProps) {
  const [formData, setFormData] = useState({
    name: prim.name,
    shape: prim.shape,
    position_x: prim.position_x,
    position_y: prim.position_y,
    position_z: prim.position_z,
    rotation_x: prim.rotation_x,
    rotation_y: prim.rotation_y,
    rotation_z: prim.rotation_z,
    scale_x: prim.scale_x,
    scale_y: prim.scale_y,
    scale_z: prim.scale_z,
    color_r: prim.color_r,
    color_g: prim.color_g,
    color_b: prim.color_b,
  });

  // Update form when prim changes externally (e.g., from gizmo)
  useEffect(() => {
    setFormData({
      name: prim.name,
      shape: prim.shape,
      position_x: prim.position_x,
      position_y: prim.position_y,
      position_z: prim.position_z,
      rotation_x: prim.rotation_x,
      rotation_y: prim.rotation_y,
      rotation_z: prim.rotation_z,
      scale_x: prim.scale_x,
      scale_y: prim.scale_y,
      scale_z: prim.scale_z,
      color_r: prim.color_r,
      color_g: prim.color_g,
      color_b: prim.color_b,
    });
  }, [prim]);

  const handleChange = (field: keyof typeof formData, value: any) => {
    const updates = { [field]: value };
    setFormData({ ...formData, ...updates });
    onPropertyChange(updates);
  };

  const inputStyle = {
    width: "100%",
    padding: "4px 6px",
    marginBottom: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "white",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "3px",
    fontSize: "12px",
  };

  return (
    <div>
      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Shape</label>
        <select
          value={formData.shape}
          onChange={(e) => handleChange('shape', e.target.value)}
          style={inputStyle}
        >
          {PRIM_SHAPES.map((shape) => (
            <option key={shape} value={shape} style={{ backgroundColor: "#1e1e1e", color: "white" }}>
              {shape.charAt(0).toUpperCase() + shape.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Position</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            value={formData.position_x}
            onChange={(e) => handleChange('position_x', parseFloat(e.target.value) || 0)}
            placeholder="X"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.position_y}
            onChange={(e) => handleChange('position_y', parseFloat(e.target.value) || 0)}
            placeholder="Y"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.position_z}
            onChange={(e) => handleChange('position_z', parseFloat(e.target.value) || 0)}
            placeholder="Z"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Rotation</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            value={formData.rotation_x}
            onChange={(e) => handleChange('rotation_x', parseFloat(e.target.value) || 0)}
            placeholder="X"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.rotation_y}
            onChange={(e) => handleChange('rotation_y', parseFloat(e.target.value) || 0)}
            placeholder="Y"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            value={formData.rotation_z}
            onChange={(e) => handleChange('rotation_z', parseFloat(e.target.value) || 0)}
            placeholder="Z"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Size</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_x}
            onChange={(e) => handleChange('scale_x', parseFloat(e.target.value) || 1)}
            placeholder="X"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_y}
            onChange={(e) => handleChange('scale_y', parseFloat(e.target.value) || 1)}
            placeholder="Y"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.scale_z}
            onChange={(e) => handleChange('scale_z', parseFloat(e.target.value) || 1)}
            placeholder="Z"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", color: "#ccc" }}>Color</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_r}
            onChange={(e) => handleChange('color_r', parseFloat(e.target.value) || 0)}
            placeholder="R"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_g}
            onChange={(e) => handleChange('color_g', parseFloat(e.target.value) || 0)}
            placeholder="G"
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.color_b}
            onChange={(e) => handleChange('color_b', parseFloat(e.target.value) || 0)}
            placeholder="B"
            style={inputStyle}
          />
        </div>
        <div style={{
          width: "100%",
          height: "30px",
          backgroundColor: `rgb(${Math.round(formData.color_r * 255)}, ${Math.round(formData.color_g * 255)}, ${Math.round(formData.color_b * 255)})`,
          borderRadius: "3px",
          marginTop: "4px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }} />
      </div>
    </div>
  );
}
