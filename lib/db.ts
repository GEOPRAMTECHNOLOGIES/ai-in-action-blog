import { MongoClient, Db, Collection } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DATABASE_NAME || "geopram_ai";

if (!uri) throw new Error("MONGODB_URI is not configured");

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _geopramDbReady: Promise<void> | undefined;
}

const clientPromise = global._mongoClientPromise ?? new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
}).connect();
if (process.env.NODE_ENV !== "production") global._mongoClientPromise = clientPromise;

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface PaymentRecord {
  _id: string;
  paymentId: string;
  email: string;
  phone: string;
  amountKes: number;
  status: PaymentStatus;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  mpesaReceiptNumber?: string;
  resultCode?: number;
  resultDesc?: string;
  accessCode?: string;
  accessCreatedAt?: Date;
  expiresAt?: Date;
  termsAcceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  receiptSentAt?: Date;
};

export async function getDb(): Promise<Db> {
  return (await clientPromise).db(dbName);
}

/**
 * Compatibility cleanup for older GeoPram deployments.
 * The old build created a unique `id_1` index while new payments use _id/paymentId.
 * We remove only that exact obsolete index. Existing checkout indexes are left alone,
 * so MongoDB never throws an IndexOptionsConflict merely because the index has another name.
 */
async function preparePaymentsCollection(db: Db): Promise<void> {
  const collection = db.collection("payments");
  try {
    const indexes = await collection.listIndexes().toArray();
    // Remove any legacy unique index on the old `id` field. New payments use `_id` + `paymentId`.
    const legacyIdIndexes = indexes.filter((index: any) => {
      const keys = index.key || {};
      return Object.keys(keys).length === 1 && keys.id === 1;
    });
    for (const legacy of legacyIdIndexes) {
      try { await collection.dropIndex(legacy.name); } catch (dropError: any) {
        if (dropError?.codeName !== "IndexNotFound" && dropError?.code !== 27) {
          console.warn("Legacy payment index could not be removed:", dropError?.message || dropError);
        }
      }
    }
  } catch (error: any) {
    // A missing index is harmless. Do not fail a payment because cleanup is unnecessary.
    if (error?.codeName !== "IndexNotFound" && error?.code !== 27) {
      console.warn("Payment index cleanup skipped:", error?.message || error);
    }
  }
}

export async function payments(): Promise<Collection<PaymentRecord>> {
  const db = await getDb();
  if (!global._geopramDbReady) {
    global._geopramDbReady = preparePaymentsCollection(db);
  }
  await global._geopramDbReady;
  return db.collection<PaymentRecord>("payments");
}
