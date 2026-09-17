import { createApp } from "./app";
import { connectDB, disconnectDB } from "./common/db";
import { env } from "./common/env";

async function main() {
  // Attempt the DB connection without blocking HTTP server startup.
  connectDB()
    .then(() => console.log("[db] MongoDB connected"))
    .catch(() =>
      console.warn(
        "[db] Starting without a MongoDB connection — /health will report it",
      ),
    );

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(
      `[server] listening on http://localhost:${env.port} (${env.nodeEnv})`,
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received — shutting down...`);

    server.close(async () => {
      console.log("[server] HTTP server closed");

      try {
        await disconnectDB();
        console.log("[db] MongoDB connection closed");
      } catch (err) {
        console.error("[db] Error closing MongoDB:", err);
      }

      process.exit(0);
    });
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err) => {
  console.error("[server] fatal startup error:", err);
  process.exit(1);
});

