# Testing Strategy

## 1. Goal

Prevent regressions in calculations, permissions, synchronization, inventory, financial records, and high-frequency daily workflows.

---

# 2. Testing Pyramid

```text
           E2E
          /   \
     Integration
        /       \
       Unit Tests
```

Most tests should be unit tests.

Critical API/database flows require integration tests.

Critical user journeys require E2E tests.

---

# 3. Unit Tests

Test pure business calculations.

Required:

### Birds

- Initial birds
- Mortality
- Birds remaining
- Birds sold
- Invalid negative results

### Mortality

- Percentage
- Zero birds edge case
- Decimal handling

### Feed

- Opening + purchases - consumption
- Negative stock prevention
- Low-stock threshold

### Sales

- Weight × rate
- Payment balance
- Overpayment rejection

### Profit

- Revenue - expenses
- Missing/incomplete data handling

### FCR

Test against the documented FCR methodology.

---

# 4. API Integration Tests

Test:

- Register
- Login
- Refresh token
- Logout
- Farm CRUD
- Shed CRUD
- Batch CRUD
- Daily record CRUD
- Feed purchase
- Feed consumption
- Medicine usage
- Vaccination completion
- Expense creation
- Sale creation
- Dashboard aggregation
- Reports
- Alerts

---

# 5. Authorization Tests

Absolutely required.

Test:

- User A cannot access User B's farm.
- Worker cannot perform accountant-only actions.
- Accountant cannot change farm ownership.
- Manager cannot access unassigned farms.
- Invalid/missing token is rejected.
- Expired token is rejected.

Do not rely on frontend role hiding as security.

---

# 6. Data Integrity Tests

Test that:

- Mortality cannot exceed available birds.
- Birds cannot become negative.
- Feed stock cannot become negative.
- Medicine stock cannot become negative.
- Sale payment cannot exceed total unless explicitly supported.
- Duplicate daily record rules are enforced.
- Critical multi-step operations are atomic.

---

# 7. Offline Tests

Test:

### Offline create

```text
Disable network
→ Create daily record
→ Close app
→ Reopen
→ Record still exists locally
```

### Reconnection

```text
Network disabled
→ Create record
→ Enable network
→ Sync
→ Verify server record
```

### Duplicate sync

Send the same operation twice.

Expected:

One business record, not two.

### Failed sync

Force API failure.

Expected:

Operation remains retryable.

---

# 8. E2E Scenarios

### E2E-01 New owner

```text
Register
→ Login
→ Create farm
→ Create shed
→ Create batch
→ Create daily record
→ View dashboard
```

### E2E-02 Daily operation

```text
Login
→ Select farm
→ Select active batch
→ Enter mortality
→ Enter feed
→ Enter weight
→ Save
→ Verify updated dashboard
```

### E2E-03 Financial operation

```text
Create expense
→ Create sale
→ Enter payment
→ Open profit report
→ Verify calculations
```

### E2E-04 Alerts

```text
Set low stock threshold
→ Consume feed
→ Cross threshold
→ Verify alert
```

---

# 9. Mobile UI Tests

Test:

- Forms
- Validation
- Navigation
- Loading states
- Empty states
- Error states
- Offline indicator
- Retry behavior
- Confirmation dialogs

---

# 10. Performance Tests

Important endpoints:

- Dashboard
- Batch details
- Daily records
- Reports
- Farm list

Test with realistic sample data:

```text
10 farms
50 sheds
100 batches
365 daily records per batch
thousands of transactions
```

The system should remain usable with pagination and indexed queries.

---

# 11. Security Tests

Test:

- SQL injection protection through ORM/parameterization
- Authentication bypass
- Authorization bypass
- Token handling
- Rate limiting
- Input validation
- File upload restrictions
- CORS
- Sensitive log leakage

---

# 12. Test Data

Create deterministic fixtures.

Do not make tests depend on production data.

Use isolated test database/schema.

---

# 13. Coverage

Initial targets:

- Business calculations: 90%+
- Authorization/security-critical services: 90%+
- Core backend services: 80%+
- Overall codebase: 70%+ initially

Coverage percentage alone does not define quality.

---

# 14. Definition of Done

A feature is complete when:

- Unit tests pass
- Integration tests pass where applicable
- Critical E2E flow passes
- Type checking passes
- Lint passes
- No known critical authorization issue exists
- Offline behavior is tested if applicable
- Error states are tested
