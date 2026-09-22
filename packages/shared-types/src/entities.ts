import type {
  AlertSeverity,
  AlertType,
  BatchStatus,
  ExpenseCategory,
  FarmStatus,
  FeedTransactionType,
  FeedType,
  MedicineTransactionType,
  PaymentStatus,
  ShedStatus,
  UserRole,
  UserStatus,
  VaccinationStatus,
} from './enums.js';

/**
 * Domain entities as they appear on the wire after Prisma serialization:
 * - Decimal-backed money/measurement columns are `string` (spec §12: "Money as Decimal/numeric strings end-to-end").
 * - Date columns (`DATE`) are `'YYYY-MM-DD'` strings; timestamps (`timestamptz`) are ISO strings.
 * - Nullable columns are `field?: T | null` (Prisma emits `null`; omitted props also allowed).
 * - Fields derived from DATABASE_AND_API.md §3–16 + spec §6 refinements.
 */

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  ownerId: string;
  name: string;
  location: string;
  address?: string | null;
  phone?: string | null;
  farmType?: string | null;
  notes?: string | null;
  status: FarmStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Shed {
  id: string;
  farmId: string;
  name: string;
  capacity: number;
  type?: string | null;
  status: ShedStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  farmId: string;
  shedId: string;
  batchNumber: string;
  breed: string;
  supplier?: string | null;
  arrivalDate: string; // 'YYYY-MM-DD'
  initialBirds: number;
  initialAverageWeightKg?: string | null; // Decimal
  costPerBird?: string | null; // Decimal
  targetSaleDate?: string | null; // 'YYYY-MM-DD'
  status: BatchStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyRecord {
  id: string;
  batchId: string;
  recordDate: string; // 'YYYY-MM-DD'
  birdsAtStart: number;
  mortality: number;
  birdsRemaining: number;
  feedConsumedKg?: string | null; // Decimal
  waterConsumedLiters?: string | null; // Decimal
  averageWeightKg?: string | null; // Decimal
  temperatureC?: string | null; // Decimal
  humidityPercent?: string | null; // Decimal
  medicineNotes?: string | null;
  vaccinationNotes?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedItem {
  id: string;
  farmId: string;
  name: string;
  type: FeedType;
  supplier?: string | null;
  unit: string;
  currentStock: string; // Decimal
  lowStockThreshold: string; // Decimal
  createdAt: string;
  updatedAt: string;
}

export interface FeedTransaction {
  id: string;
  feedItemId: string;
  batchId?: string | null;
  type: FeedTransactionType;
  quantity: string; // Decimal
  unitCost?: string | null; // Decimal
  totalCost?: string | null; // Decimal
  transactionDate: string; // 'YYYY-MM-DD'
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Medicine {
  id: string;
  farmId: string;
  name: string;
  supplier?: string | null;
  unit: string;
  currentStock: string; // Decimal
  lowStockThreshold: string; // Decimal
  expiryDate?: string | null; // 'YYYY-MM-DD'
  createdAt: string;
  updatedAt: string;
}

export interface MedicineTransaction {
  id: string;
  medicineId: string;
  batchId?: string | null;
  type: MedicineTransactionType;
  quantity: string; // Decimal (measurement column per spec §6)
  transactionDate: string; // 'YYYY-MM-DD'
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Vaccination {
  id: string;
  batchId: string;
  vaccineName: string;
  scheduledDate: string; // 'YYYY-MM-DD'
  completedDate?: string | null; // 'YYYY-MM-DD'
  dose?: string | null; // Decimal (measurement column per spec §6)
  supplier?: string | null;
  status: VaccinationStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  farmId: string;
  batchId?: string | null;
  category: ExpenseCategory;
  description: string;
  amount: string; // Decimal
  expenseDate: string; // 'YYYY-MM-DD'
  supplier?: string | null;
  paymentStatus: PaymentStatus;
  receiptObjectKey?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  farmId: string;
  batchId: string;
  buyer: string;
  saleDate: string; // 'YYYY-MM-DD'
  birdsSold: number;
  totalWeightKg: string; // Decimal
  ratePerKg: string; // Decimal
  totalAmount: string; // Decimal
  amountReceived: string; // Decimal
  outstandingAmount: string; // Decimal
  paymentStatus: PaymentStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  userId: string;
  farmId?: string | null;
  batchId?: string | null;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null; // ISO timestamp
}

export interface FarmMember {
  id: string;
  farmId: string;
  userId: string;
  role: UserRole;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string; // ISO timestamp
  revokedAt?: string | null; // ISO timestamp
  createdAt: string;
}
