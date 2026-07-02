## ADDED Requirements

### Requirement: Calculate total and category budget progress
The system SHALL calculate budget usage from expense records whose record date belongs to the requested month, with child-category expenses aggregated into their parent big category.

#### Scenario: Child expense contributes to parent budget
- **WHEN** an expense is recorded in a child category
- **THEN** its amount contributes to the total budget and the parent big-category budget

#### Scenario: Income does not consume budget
- **WHEN** an income record exists in the requested month
- **THEN** it does not affect total or category budget usage

### Requirement: Display budget state without replacing existing information
The client SHALL show budget information as an enhancement to the existing home and statistics pages.

#### Scenario: Budget is configured
- **WHEN** a configured month is displayed
- **THEN** the home page shows used, remaining and usage percentage and the statistics page shows configured category progress

#### Scenario: Budget is not configured
- **WHEN** an unset month is displayed
- **THEN** the home and statistics pages continue to show normal records and spending data without zero-budget progress or over-budget labels

### Requirement: Notify on threshold crossing
The system SHALL return a non-blocking alert when a newly added expense crosses from below 80 percent to at least 80 percent, or from below 100 percent to at least 100 percent, for the total or matching category budget.

#### Scenario: Expense crosses warning threshold
- **WHEN** a successful expense changes a configured budget from below 80 percent to between 80 and 100 percent
- **THEN** the record response contains a warning alert and the saved record remains successful

#### Scenario: Expense crosses over-budget threshold
- **WHEN** a successful expense changes a configured budget from below 100 percent to at least 100 percent
- **THEN** the record response contains an over-budget alert with higher priority than a warning

#### Scenario: Expense remains in the same threshold band
- **WHEN** a successful expense does not cross a threshold
- **THEN** the record response contains no budget alert
