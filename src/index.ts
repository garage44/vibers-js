import { serve } from "bun";
import index from "./index.html";
import * as regionRoutes from "./server/routes/regions";
import * as primRoutes from "./server/routes/prims";
import { getDatabase } from "./server/db/migrations";

// Initialize database on server startup
try {
  getDatabase();
  console.log("✅ Database initialized");
} catch (error) {
  console.error("❌ Failed to initialize database:", error);
}

// CORS headers helper
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = serve({
  routes: {
    // Serve static files from public directory
    "/textures/*": async (req) => {
      const url = new URL(req.url);
      const filePath = url.pathname;
      try {
        const file = Bun.file(`public${filePath}`);
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "Cache-Control": "public, max-age=86400",
              ...corsHeaders,
            },
          });
        }
        return new Response("File not found", { status: 404 });
      } catch (error) {
        console.error(`Failed to serve file ${filePath}:`, error);
        return new Response("Internal server error", { status: 500 });
      }
    },
    
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/regions": {
      async GET(req) {
        const response = await regionRoutes.getRegions();
        // Add CORS headers
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async POST(req) {
        const response = await regionRoutes.createRegion(req);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async OPTIONS() {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      },
    },

    "/api/regions/:id": {
      async GET(req) {
        const id = req.params.id;
        const response = await regionRoutes.getRegion(id);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async PUT(req) {
        const id = req.params.id;
        const response = await regionRoutes.updateRegion(id, req);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async DELETE(req) {
        const id = req.params.id;
        const response = await regionRoutes.deleteRegion(id);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async OPTIONS() {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      },
    },

    "/api/prims": {
      async GET(req) {
        const url = new URL(req.url);
        const regionId = url.searchParams.get("region_id");
        const response = await primRoutes.getPrims(regionId || undefined);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async POST(req) {
        const response = await primRoutes.createPrim(req);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async OPTIONS() {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      },
    },

    "/api/prims/:id": {
      async GET(req) {
        const id = req.params.id;
        const response = await primRoutes.getPrim(id);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async PUT(req) {
        const id = req.params.id;
        const response = await primRoutes.updatePrim(id, req);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async DELETE(req) {
        const id = req.params.id;
        const response = await primRoutes.deletePrim(id);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      },
      async OPTIONS() {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      },
    },

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    // Proxy for OSM tiles to handle CORS
    // Match route without .png extension, Bun will capture the full path
    "/api/tiles/*": async (req) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/');
      // Path format: /api/tiles/z/x/y.png
      const z = pathParts[3];
      const x = pathParts[4];
      const y = pathParts[5]?.replace('.png', '') || pathParts[5];
      
      if (!z || !x || !y) {
        return new Response("Invalid tile coordinates", { status: 400 });
      }
      
      const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      
      console.log(`🌍 Fetching OSM tile: ${z}/${x}/${y} from ${osmUrl}`);
      
      try {
        const response = await fetch(osmUrl, {
          headers: {
            "User-Agent": "SecondLifeClone/1.0",
          },
        });
        
        if (!response.ok) {
          console.error(`❌ OSM tile fetch failed: ${response.status} ${response.statusText}`);
          return new Response(`Tile not found: ${response.status}`, { status: 404 });
        }
        
        const imageData = await response.arrayBuffer();
        console.log(`✅ Successfully fetched tile ${z}/${x}/${y}, size: ${imageData.byteLength} bytes`);
        
        return new Response(imageData, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400", // Cache for 1 day
            ...corsHeaders,
          },
        });
      } catch (error) {
        console.error(`❌ Failed to fetch tile ${z}/${x}/${y}:`, error);
        return new Response(`Failed to fetch tile: ${error}`, { status: 500 });
      }
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
