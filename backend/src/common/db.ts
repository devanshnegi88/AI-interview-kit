import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env";

// Use Google DNS because the current ISP DNS rejects MongoDB Atlas SRV lookups.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

/**
 * Mongoose readyState -> human-readable status, used by the health endpoint.
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting.
 */
export function dbStatus(): "connected" | "connecting" | "disconnected" | "unknown" {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 0:
      return "disconnected";
    default:
      return "unknown";
  }
}

let connectPromise: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB once.
 */
export function connectDB(): Promise<typeof mongoose> {
  if (connectPromise) return connectPromise;

  connectPromise = mongoose.connect(env.mongoUri).catch((err) => {
    console.error("[db] MongoDB connection failed:", err.message);
    connectPromise = null;
    throw err;
  });

  return connectPromise;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  connectPromise = null;
}