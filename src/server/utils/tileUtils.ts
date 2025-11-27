/**
 * OSM Tile Utilities
 * Converts between geographic coordinates (lat/lng) and OSM tile coordinates
 * Uses Web Mercator projection
 */

const EARTH_RADIUS = 6378137; // meters
const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS; // meters

/**
 * Convert latitude/longitude to OSM tile coordinates
 * @param lat Latitude in degrees
 * @param lng Longitude in degrees
 * @param zoom Zoom level (0-19)
 * @returns Tile coordinates {x, y}
 */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(n * ((lng + 180) / 360));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2
  );
  return { x, y };
}

/**
 * Convert OSM tile coordinates to latitude/longitude (top-left corner of tile)
 * @param x Tile X coordinate
 * @param y Tile Y coordinate
 * @param zoom Zoom level
 * @returns Geographic coordinates {lat, lng}
 */
export function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/**
 * Get the real-world meters per tile at a given zoom level
 * @param zoom Zoom level
 * @param lat Latitude (for more accurate calculation, defaults to equator)
 * @returns Meters per tile
 */
export function tileToMeters(zoom: number, lat: number = 0): number {
  const latRad = (lat * Math.PI) / 180;
  const metersPerPixel = (EARTH_CIRCUMFERENCE * Math.cos(latRad)) / (256 * Math.pow(2, zoom));
  return metersPerPixel * 256; // 256 pixels per tile
}

/**
 * Find the optimal zoom level closest to target meters per tile
 * @param targetMeters Target meters per tile
 * @param lat Latitude for calculation (defaults to equator)
 * @returns Optimal zoom level
 */
export function findOptimalZoom(targetMeters: number, lat: number = 0): number {
  let bestZoom = 0;
  let bestDiff = Infinity;

  for (let zoom = 0; zoom <= 19; zoom++) {
    const meters = tileToMeters(zoom, lat);
    const diff = Math.abs(meters - targetMeters);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestZoom = zoom;
    }
  }

  return bestZoom;
}

// Fixed zoom level for regions (256m target, zoom 17 ≈ 305.7m per tile)
export const REGION_ZOOM_LEVEL = 17;
export const REGION_SIZE_METERS = 256;

