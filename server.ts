import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to load and run API routes from /api folder
  // In a real Vercel environment, this is automatic.
  // Here we simulate it for the dev server.
  app.all("/api/:route", async (req, res) => {
    const { route } = req.params;
    try {
      const modulePath = path.join(__dirname, "api", `${route}.ts`);
      const handler = await import(modulePath);
      
      if (handler.default) {
        return handler.default(req, res);
      } else {
        res.status(404).json({ success: false, error: `Handler for /api/${route} not found.` });
      }
    } catch (error: any) {
      console.error(`❌ Error in /api/${route}:`, error);
      res.status(500).json({ success: false, error: "Internal Server Error", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
