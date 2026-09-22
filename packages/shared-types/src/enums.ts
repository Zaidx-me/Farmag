export const UserRole = { Owner: 'OWNER', Manager: 'MANAGER', Worker: 'WORKER', Accountant: 'ACCOUNTANT' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const FarmStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type FarmStatus = (typeof FarmStatus)[keyof typeof FarmStatus];
export const ShedStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type ShedStatus = (typeof ShedStatus)[keyof typeof ShedStatus];
export const BatchStatus = { Upcoming: 'UPCOMING', Active: 'ACTIVE', Sold: 'SOLD', Closed: 'CLOSED' } as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];
export const PaymentStatus = { Paid: 'PAID', PartiallyPaid: 'PARTIALLY_PAID', Pending: 'PENDING' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const FeedType = { Starter: 'STARTER', Grower: 'GROWER', Finisher: 'FINISHER', Other: 'OTHER' } as const;
export type FeedType = (typeof FeedType)[keyof typeof FeedType];
export const FeedTransactionType = { Purchase: 'PURCHASE', Consumption: 'CONSUMPTION', Adjustment: 'ADJUSTMENT' } as const;
export type FeedTransactionType = (typeof FeedTransactionType)[keyof typeof FeedTransactionType];
export const MedicineTransactionType = { Purchase: 'PURCHASE', Usage: 'USAGE', Adjustment: 'ADJUSTMENT' } as const;
export type MedicineTransactionType = (typeof MedicineTransactionType)[keyof typeof MedicineTransactionType];
export const VaccinationStatus = { Upcoming: 'UPCOMING', Completed: 'COMPLETED', Missed: 'MISSED' } as const;
export type VaccinationStatus = (typeof VaccinationStatus)[keyof typeof VaccinationStatus];
export const ExpenseCategory = {
  Chicks: 'CHICKS', Feed: 'FEED', Medicine: 'MEDICINE', Vaccination: 'VACCINATION', Labour: 'LABOUR',
  Electricity: 'ELECTRICITY', Gas: 'GAS', Transport: 'TRANSPORT', Maintenance: 'MAINTENANCE',
  Equipment: 'EQUIPMENT', Other: 'OTHER'
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
export const AlertType = {
  HighMortality: 'HIGH_MORTALITY', LowFeed: 'LOW_FEED', LowMedicine: 'LOW_MEDICINE',
  VaccinationDue: 'VACCINATION_DUE', MedicineExpiry: 'MEDICINE_EXPIRY', LowWeight: 'LOW_WEIGHT',
  PaymentOverdue: 'PAYMENT_OVERDUE', SaleDateApproaching: 'SALE_DATE_APPROACHING'
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];
export const AlertSeverity = { Info: 'INFO', Warning: 'WARNING', Critical: 'CRITICAL' } as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];
export const SyncOperationType = { Create: 'CREATE', Update: 'UPDATE', Delete: 'DELETE' } as const;
export type SyncOperationType = (typeof SyncOperationType)[keyof typeof SyncOperationType];
export const SyncOperationStatus = { Pending: 'PENDING', Syncing: 'SYNCING', Synced: 'SYNCED', Failed: 'FAILED' } as const;
export type SyncOperationStatus = (typeof SyncOperationStatus)[keyof typeof SyncOperationStatus];
