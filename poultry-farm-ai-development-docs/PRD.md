# Poultry Farm Management App — Product Requirements Document (PRD)

**Document Version:** 1.0  
**Status:** MVP Definition  
**Product:** Poultry Farm Management  
**Primary Platform:** Android-first React Native / Expo mobile application  
**Backend:** Node.js + Fastify + PostgreSQL + Prisma  
**Deployment:** Private VPS + Coolify  
**Initial Commercial Model:** Completely free; subscriptions/payments intentionally disabled

---

## 1. Product Vision

Build a practical, offline-first mobile application that allows poultry farm owners, managers, workers, and accountants to record and understand daily farm operations from one place.

The app should replace fragmented paper registers and spreadsheets with a simple workflow:

> Farm → Shed → Batch/Flock → Daily Records → Feed/Health → Expenses/Sales → Reports → Decisions

The product must prioritize fast data entry, reliable calculations, offline operation, data ownership, and clear farm-level insights.

---

## 2. Problem Statement

Poultry operations generate daily information about:

- Bird counts
- Mortality
- Feed consumption
- Weight
- Water
- Temperature/humidity
- Medicine
- Vaccination
- Expenses
- Sales
- Payments

When this information is maintained manually or across disconnected spreadsheets, it becomes difficult to:

- Know the current flock position
- Compare performance between batches
- Detect unusual mortality or low weight
- Track feed stock and consumption
- Understand total batch cost
- Calculate revenue and profit
- Produce reliable reports

The application solves this by centralizing operational and financial records.

---

## 3. Target Users

### 3.1 Farm Owner

Needs a high-level view of all farms, batches, financial performance, and alerts.

Primary actions:

- Create/manage farms
- View dashboard
- Review batches
- Review expenses and sales
- View reports
- Receive alerts
- Manage users

### 3.2 Farm Manager

Needs operational control.

Primary actions:

- Manage sheds
- Manage batches
- Record daily data
- Track feed
- Track medicine/vaccination
- View operational reports

### 3.3 Farm Worker

Needs extremely fast data entry.

Primary actions:

- Select assigned farm/shed
- Enter daily mortality
- Enter feed consumption
- Enter weight/water/environment data
- Record medicine/vaccination
- View only the information necessary for assigned work

### 3.4 Accountant

Needs financial records.

Primary actions:

- Record expenses
- Record sales
- Track payments
- View financial reports
- Export financial data

---

# 4. Product Principles

1. **Offline-first:** essential farm recording must work without internet.
2. **Fast:** common daily entry should take less than one minute.
3. **Accurate:** calculations must be deterministic and tested.
4. **Simple:** avoid unnecessary screens and complicated workflows.
5. **Secure:** users only access authorized data.
6. **Free in MVP:** no subscriptions, payments, paywalls, or artificial limits.
7. **Extensible:** future subscription functionality must be possible without redesigning the core.
8. **Real application:** no fake buttons, placeholder CRUD, or static demo-only functionality.

---

# 5. MVP Scope

## 5.1 Authentication

- Registration
- Login
- Logout
- Forgot password/reset password
- Profile
- Role assignment

## 5.2 Farm Management

- Create farm
- Edit farm
- View farm
- Delete/archive farm
- Search/filter farms

## 5.3 Shed Management

- Create shed
- Edit shed
- View shed
- Set capacity/type/status
- Assign batch

## 5.4 Batch/Flock Management

- Create batch
- Assign farm/shed
- Breed
- Supplier
- Arrival date
- Initial birds
- Initial weight
- Target sale date
- Current status
- Batch history

## 5.5 Daily Records

- Birds at start
- Mortality
- Birds remaining
- Feed consumed
- Water consumed
- Average weight
- Temperature
- Humidity
- Medicine
- Vaccination
- Notes

## 5.6 Feed

- Inventory
- Purchases
- Consumption
- Stock balance
- Supplier
- Cost
- Low-stock threshold

## 5.7 Medicine

- Inventory
- Purchase
- Usage
- Expiry
- Low-stock warning

## 5.8 Vaccination

- Schedule
- Due date
- Completion
- Dose
- Batch association
- Reminder

## 5.9 Expenses

Categories:

- Chicks
- Feed
- Medicine
- Vaccination
- Labour
- Electricity
- Gas
- Transport
- Maintenance
- Equipment
- Other

## 5.10 Sales

- Buyer
- Batch
- Birds sold
- Total weight
- Rate/kg
- Total amount
- Amount received
- Outstanding amount
- Payment status

## 5.11 Dashboard

Display:

- Farms
- Active batches
- Birds
- Mortality
- Average weight
- FCR
- Feed
- Expenses
- Revenue
- Profit/estimated profit

## 5.12 Reports

- Growth
- Mortality
- Feed
- Medicine
- Vaccination
- Expenses
- Sales
- Profit/loss
- Batch comparison
- Farm performance

## 5.13 Alerts

- High mortality
- Low feed
- Low medicine
- Vaccination due
- Medicine expiry
- Low weight
- Payment overdue
- Sale date approaching

## 5.14 Export

- CSV
- PDF where practical
- Mobile share sheet

---

# 6. Explicitly Out of Scope for MVP

Do NOT build:

- Subscription plans
- Paid tiers
- Payment gateway
- Stripe
- JazzCash/Easypaisa subscription billing
- In-app purchases
- Premium feature restrictions
- Advertising system
- Marketplace
- Poultry feed marketplace
- Veterinary telemedicine
- AI diagnosis
- Automated disease diagnosis
- Live IoT sensor integration
- Complex accounting/ERP
- Multi-country tax systems

These can be considered later.

---

# 7. User Stories

### Authentication

**US-AUTH-01**

As a farm owner, I want to create an account so that my farm data belongs to my account.

**Acceptance criteria**

- Given a valid registration form, when I submit it, then an account is created.
- Given an existing email, when I register, then the API returns a clear duplicate-account error.
- Given invalid fields, when I submit, then validation errors are shown.

### Farm

**US-FARM-01**

As an owner, I want to create a farm so that I can organize my poultry operations.

**Acceptance criteria**

- Given valid farm information, when I save it, then the farm appears in my farm list.
- Given missing required fields, when I save, then the form blocks submission.
- Given an offline connection, when I save, then the record is stored locally and queued for synchronization.

### Batch

**US-BATCH-01**

As a manager, I want to create a flock batch so that I can track its complete lifecycle.

**Acceptance criteria**

- Given valid batch information, when saved, then a unique batch number exists.
- Given initial birds of 10,000 and mortality of 100, then current birds are 9,900.
- A batch cannot be assigned to an unauthorized farm/shed.

### Daily Record

**US-DAILY-01**

As a worker, I want to enter today's flock data quickly.

**Acceptance criteria**

- Given an active batch, when I open daily entry, then today's relevant fields are available.
- Mortality cannot exceed available birds.
- When the record is saved, calculated values update.
- When offline, the record is stored locally and synchronized later.

### Feed

**US-FEED-01**

As a manager, I want to track feed stock.

**Acceptance criteria**

- Purchase increases available stock.
- Consumption decreases available stock.
- Stock cannot become negative.
- When stock crosses the configured threshold, an alert is generated.

### Sales

**US-SALES-01**

As an accountant, I want to record bird sales.

**Acceptance criteria**

- Total amount equals total weight × rate/kg.
- Payment received cannot exceed total amount.
- Outstanding amount is calculated automatically.

### Reports

**US-REPORT-01**

As an owner, I want to view batch profitability.

**Acceptance criteria**

- When expense and sales data exists, the report calculates totals from stored records.
- The report identifies whether values are actual, estimated, or incomplete.
- Filters by farm, batch, and date work correctly.

---

# 8. Core Business Rules

## Bird count

`current_birds = initial_birds - cumulative_mortality - cumulative_birds_sold`

The system must prevent negative bird counts.

## Mortality percentage

`mortality_percentage = cumulative_mortality / initial_birds × 100`

## Sales total

`total_amount = total_weight_kg × rate_per_kg`

## Outstanding payment

`outstanding = total_amount - amount_received`

## Feed balance

`closing_stock = opening_stock + purchases - consumption`

## Profit

For completed/known records:

`profit = sales_revenue - total_expenses`

If some costs/revenue are missing, label the result as estimated or incomplete rather than presenting it as a definitive profit.

## FCR

FCR must be calculated from a clearly defined methodology and stored inputs. The implementation must document exactly which weight-gain and feed-consumption periods are used.

---

# 9. Non-Functional Requirements

- Android-first
- iOS-compatible architecture
- Offline data entry
- Secure HTTPS API
- Password hashing
- JWT access + refresh token architecture
- PostgreSQL transactions for critical writes
- API validation
- Structured error responses
- Database migrations
- Automated tests for calculations and critical API endpoints
- Logging without leaking passwords/tokens
- Backups for production database
- Pagination for large datasets
- No unnecessary paid third-party services

---

# 10. Success Metrics

Initial MVP metrics:

- Daily entry can be completed in under 60 seconds after setup.
- Zero data loss during normal offline/online synchronization.
- Critical calculation tests pass.
- No unauthorized cross-farm data access.
- Dashboard loads from aggregated backend responses rather than excessive client-side requests.
- A new user can create a farm, shed, batch, and daily record without documentation.

---

# 11. Future Roadmap

Potential future versions:

- Web owner dashboard
- Subscription plans
- Multi-tenant business organizations
- Advanced permissions
- Automated billing
- Advanced analytics
- IoT sensors
- Weather integrations
- More sophisticated forecasting
- Inventory purchasing workflows
- Supplier/customer management
- Multi-language support
- Enterprise deployment

These are future features, not MVP requirements.
