import * as THREE from "three";

const TILE_CACHE = new Map<string, THREE.Texture>();

/**
 * Get OSM tile URL for given tile coordinates
 * Uses proxy endpoint to avoid CORS issues
 */
export function getOSMTileUrl(x: number, y: number, z: number): string {
  // Use proxy endpoint to handle CORS
  return `/api/tiles/${z}/${x}/${y}.png`;
}

/**
 * Load OSM tile as Three.js texture
 * Uses caching to avoid reloading the same tile
 */
export async function loadOSMTile(
  x: number,
  y: number,
  z: number
): Promise<THREE.Texture> {
  const cacheKey = `${z}/${x}/${y}`;

  if (TILE_CACHE.has(cacheKey)) {
    const cachedTexture = TILE_CACHE.get(cacheKey)!;
    // Ensure flipY is set correctly even for cached textures
    cachedTexture.flipY = true;
    return cachedTexture;
  }

  const url = getOSMTileUrl(x, y, z);
  console.log(`Fetching OSM tile from: ${url}`);
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        console.log(`✅ Loaded tile texture: ${cacheKey}, size: ${texture.image.width}x${texture.image.height}`);
        // OSM tiles use standard image coordinates (Y-down), Three.js uses Y-up
        // For a plane rotated -90 degrees on X axis (horizontal plane), we need to flip Y
        texture.flipY = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.format = THREE.RGBAFormat;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.error(`❌ Failed to load tile ${cacheKey} from ${url}:`, error);
        reject(error);
      }
    );
  });

  TILE_CACHE.set(cacheKey, texture);
  return texture;
}

/**
 * Load a 2x2 grid of tiles and combine them into a higher resolution texture
 * This doubles the resolution (512x512) while keeping the same zoom level
 */
export async function loadHighResTile(
  x: number,
  y: number,
  z: number
): Promise<THREE.Texture> {
  const cacheKey = `highres_${z}/${x}/${y}`;

  if (TILE_CACHE.has(cacheKey)) {
    const cachedTexture = TILE_CACHE.get(cacheKey)!;
    cachedTexture.flipY = true;
    return cachedTexture;
  }

  // Load 4 tiles in a 2x2 grid
  const tiles = await Promise.all([
    loadOSMTile(x, y, z),           // Top-left
    loadOSMTile(x + 1, y, z),       // Top-right
    loadOSMTile(x, y + 1, z),       // Bottom-left
    loadOSMTile(x + 1, y + 1, z),   // Bottom-right
  ]);

  // Ensure all images are loaded
  await Promise.all(
    tiles.map(
      (tile) =>
        new Promise<void>((resolve) => {
          if (tile.image.complete) {
            resolve();
          } else {
            tile.image.onload = () => resolve();
            tile.image.onerror = () => resolve(); // Continue even if one fails
          }
        })
    )
  );

  // Create a canvas to combine the tiles
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Draw tiles in 2x2 grid
  // Top row
  if (tiles[0].image.complete) {
    ctx.drawImage(tiles[0].image, 0, 0, 256, 256);
  }
  if (tiles[1].image.complete) {
    ctx.drawImage(tiles[1].image, 256, 0, 256, 256);
  }
  // Bottom row
  if (tiles[2].image.complete) {
    ctx.drawImage(tiles[2].image, 0, 256, 256, 256);
  }
  if (tiles[3].image.complete) {
    ctx.drawImage(tiles[3].image, 256, 256, 256, 256);
  }

  // Create texture from combined canvas
  const combinedTexture = new THREE.CanvasTexture(canvas);
  combinedTexture.flipY = true;
  // Use mipmaps for better quality at different distances
  combinedTexture.minFilter = THREE.LinearMipmapLinearFilter;
  combinedTexture.magFilter = THREE.LinearFilter;
  combinedTexture.wrapS = THREE.ClampToEdgeWrapping;
  combinedTexture.wrapT = THREE.ClampToEdgeWrapping;
  combinedTexture.format = THREE.RGBAFormat;
  combinedTexture.generateMipmaps = true;
  combinedTexture.needsUpdate = true;

  console.log(`✅ Created high-res texture: ${cacheKey}, size: 512x512`);

  TILE_CACHE.set(cacheKey, combinedTexture);
  return combinedTexture;
}

/**
 * Clear tile cache (useful for memory management)
 */
export function clearTileCache(): void {
  TILE_CACHE.forEach((texture) => texture.dispose());
  TILE_CACHE.clear();
}

