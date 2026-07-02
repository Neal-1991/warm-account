## ADDED Requirements

### Requirement: Configure a monthly family budget
The system SHALL allow a book owner to save one total expense budget and zero or more expense big-category budgets for the current or a future month, with all amounts stored as positive integer cents.

#### Scenario: Owner saves a monthly budget
- **WHEN** the book owner submits a valid total amount and valid expense big-category limits for the current month
- **THEN** the system creates or updates that book and month budget

#### Scenario: Invalid category budget is rejected
- **WHEN** a submitted category is not an expense big category belonging to the book
- **THEN** the system rejects the entire save operation without changing the existing budget

### Requirement: Copy the previous month budget
The system SHALL allow the book owner to copy the previous month budget into a current or future month that does not already have a budget.

#### Scenario: Previous budget is copied
- **WHEN** the target month has no budget and the previous month has one
- **THEN** the system copies the total amount and all still-valid expense big-category limits

#### Scenario: Existing target budget is preserved
- **WHEN** the target month already has a budget
- **THEN** the system rejects the copy and does not overwrite it

### Requirement: Historical budgets are immutable
The system MUST treat months before the current Beijing calendar month as read-only.

#### Scenario: Historical mutation is rejected
- **WHEN** a client attempts to save, copy into, or delete a historical month budget
- **THEN** the server rejects the operation

### Requirement: Missing budget does not block accounting
The system SHALL represent an unset month as no budget rather than a zero-value budget.

#### Scenario: Month has no budget
- **WHEN** a member reads a month without a saved budget
- **THEN** the system returns no budget while records and spending statistics remain available
