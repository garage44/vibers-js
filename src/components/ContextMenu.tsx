import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreatePrim?: () => void;
  onEditPrim?: () => void;
}

export function ContextMenu({ x, y, onClose, onCreatePrim, onEditPrim }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isOpening = true; // Flag to prevent immediate close when opening
    
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close immediately after opening (give it time to render)
      if (isOpening) {
        return;
      }
      
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Only close on left-click, never on right-click
        if (e.button === 0 || (e.type === 'click' && e.button === undefined)) {
          onClose();
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Don't close on right-click - allow new menu to open
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Close current menu when right-clicking elsewhere, but with a delay
        setTimeout(() => {
          onClose();
        }, 50);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Small delay to prevent immediate close when opening
    const timeoutId = setTimeout(() => {
      isOpening = false;
      document.addEventListener("click", handleClickOutside, true);
      document.addEventListener("contextmenu", handleContextMenu, true);
    }, 200); // Increased delay to ensure menu is fully rendered

    window.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        color: "white",
        padding: "8px 0",
        borderRadius: "4px",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        zIndex: 10000,
        minWidth: "150px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {onEditPrim && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onEditPrim();
            onClose();
          }}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(74, 144, 226, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Edit Prim
        </div>
      )}
      {onCreatePrim && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onCreatePrim();
            onClose();
          }}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(74, 144, 226, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Create Prim Here
        </div>
      )}
    </div>
  );
}

