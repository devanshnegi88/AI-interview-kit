import mongoose, { Schema } from "mongoose";

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

const SessionSchema = new Schema<SessionDoc>(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserModel: mongoose.Model<UserDoc> =
  (mongoose.models.User as mongoose.Model<UserDoc> | undefined) ??
  mongoose.model<UserDoc>("User", UserSchema);

export const SessionModel: mongoose.Model<SessionDoc> =
  (mongoose.models.Session as mongoose.Model<SessionDoc> | undefined) ??
  mongoose.model<SessionDoc>("Session", SessionSchema);
