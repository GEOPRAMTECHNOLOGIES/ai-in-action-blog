import { MongoClient, Db, Collection } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DATABASE_NAME || "geopram_ai";

if (!uri) {
  throw new Error("MONGODB_URI is not configured");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise =
  global._mongoClientPromise ??
  new MongoClient(uri).connect();

if (process.env.NODE_ENV !== "production") {
  global._mongoClientPromise = clientPromise;
}

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface PaymentRecord {
  _id?: string;
  email: string;
  phone: string;
  amountKes: number;
  status: PaymentStatus;
  merchantRequestID?: string;
  checkoutRequestID?: string;
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
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}

export async function payments(): Promise<Collection<PaymentRecord>> {
  const db = await getDb();
  return db.collection<PaymentRecord>("payments");
}
