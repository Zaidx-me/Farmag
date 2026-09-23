/**
 * Local SQLite schema — a mirror of the API's Prisma models (see
 * apps/api/prisma/schema.prisma) with camelCase→snake_case columns plus the
 * sync bookkeeping columns `id`, `sync_status`, `updated_at`. `sync_operations`
 * keeps the camelCase columns mandated by the sync protocol (see the brief).
 */

export const LOCAL_TABLES = [
  'users',
  'farms',
  'sheds',
  'batches',
  'daily_records',
  'feed_items',
  'feed_transactions',
  'medicines',
  'medicine_transactions',
  'vaccinations',
  'expenses',
  'sales',
  'alerts',
  'sync_operations',
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];

const USERS = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'OWNER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const FARMS = `
CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  farm_type TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const SHEDS = `
CREATE TABLE sheds (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const BATCHES = `
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  shed_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  breed TEXT NOT NULL,
  supplier TEXT,
  arrival_date TEXT NOT NULL,
  initial_birds INTEGER NOT NULL,
  initial_average_weight_kg REAL,
  cost_per_bird REAL,
  target_sale_date TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING',
  notes TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const DAILY_RECORDS = `
CREATE TABLE daily_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  record_date TEXT NOT NULL,
  birds_at_start INTEGER NOT NULL,
  mortality INTEGER NOT NULL,
  birds_remaining INTEGER NOT NULL,
  feed_consumed_kg REAL,
  water_consumed_liters REAL,
  average_weight_kg REAL,
  temperature_c REAL,
  humidity_percent REAL,
  medicine_notes TEXT,
  vaccination_notes TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const FEED_ITEMS = `
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  supplier TEXT,
  unit TEXT NOT NULL,
  current_stock REAL NOT NULL,
  low_stock_threshold REAL NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const FEED_TRANSACTIONS = `
CREATE TABLE feed_transactions (
  id TEXT PRIMARY KEY,
  feed_item_id TEXT NOT NULL,
  batch_id TEXT,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  transaction_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const MEDICINES = `
CREATE TABLE medicines (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  supplier TEXT,
  unit TEXT NOT NULL,
  current_stock REAL NOT NULL,
  low_stock_threshold REAL NOT NULL,
  expiry_date TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const MEDICINE_TRANSACTIONS = `
CREATE TABLE medicine_transactions (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  batch_id TEXT,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  transaction_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const VACCINATIONS = `
CREATE TABLE vaccinations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  vaccine_name TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  completed_date TEXT,
  dose REAL,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING',
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const EXPENSES = `
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  batch_id TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  supplier TEXT,
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  receipt_object_key TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const SALES = `
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  buyer TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  birds_sold INTEGER NOT NULL,
  total_weight_kg REAL NOT NULL,
  rate_per_kg REAL NOT NULL,
  total_amount REAL NOT NULL,
  amount_received REAL NOT NULL DEFAULT 0,
  outstanding_amount REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const ALERTS = `
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  farm_id TEXT,
  batch_id TEXT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  read_at TEXT,
  sync_status TEXT DEFAULT 'synced',
  updated_at TEXT
);
`;

const SYNC_OPERATIONS = `
CREATE TABLE sync_operations (
  operationId TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  operationType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retryCount INTEGER NOT NULL DEFAULT 0,
  lastError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

const TABLE_DEFINITIONS: string[] = [
  USERS,
  FARMS,
  SHEDS,
  BATCHES,
  DAILY_RECORDS,
  FEED_ITEMS,
  FEED_TRANSACTIONS,
  MEDICINES,
  MEDICINE_TRANSACTIONS,
  VACCINATIONS,
  EXPENSES,
  SALES,
  ALERTS,
  SYNC_OPERATIONS,
];

/** v1 schema — all 14 tables in one SQL string (migration v1). */
export const LOCAL_SCHEMA_SQL = TABLE_DEFINITIONS.join('\n');