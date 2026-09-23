import mongoose, { Document, Model, Schema } from "mongoose";

export interface IDocument extends Document {
  tenantId: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({
  tenantId: 1,
  createdAt: -1,
});

export const DocumentModel: Model<IDocument> =
  mongoose.model<IDocument>("Document", documentSchema);