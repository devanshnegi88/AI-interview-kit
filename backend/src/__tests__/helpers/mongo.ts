import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { UserModel, SessionModel } from "../../auth/models";

let mongo: MongoMemoryServer | null = null;

export async function startTestMongo(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await UserModel.createIndexes();
  await SessionModel.createIndexes();
}

export async function stopTestMongo(): Promise<void> {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
}

export async function resetAuthCollections(): Promise<void> {
  await UserModel.deleteMany({});
  await SessionModel.deleteMany({});
}
