## ADDED Requirements

### Requirement: Missing previous budget produces visible feedback
The system SHALL return a stable business error when a user copies a previous month that has no budget, and the client SHALL display that failure after dismissing its loading state.

#### Scenario: Previous month has no budget
- **WHEN** an owner requests copying the previous month and the source month has no budget
- **THEN** the server returns `PREVIOUS_BUDGET_NOT_FOUND`
- **AND** the client displays “上月未设置预算”
- **AND** no target-month budget is created

### Requirement: Category budget continues warning after overspend
The system SHALL issue an over-budget alert for every new expense in a category whose configured budget is already at or above 100 percent, while retaining first-crossing behavior for warnings and total budgets.

#### Scenario: Category first crosses warning threshold
- **WHEN** a new category expense changes category usage from below 80 percent to at least 80 percent but below 100 percent
- **THEN** the successful record response contains one category warning alert

#### Scenario: Category remains in warning band
- **WHEN** a new category expense starts and ends between 80 percent and 100 percent
- **THEN** the successful record response contains no budget alert for that category

#### Scenario: Category first reaches budget limit
- **WHEN** a new category expense changes category usage from below 100 percent to at least 100 percent
- **THEN** the successful record response contains a category over-budget alert with trigger `threshold`

#### Scenario: Category remains over budget
- **WHEN** a new category expense increases category usage that was already at or above 100 percent
- **THEN** the successful record response contains a category over-budget alert with trigger `continued-over`

#### Scenario: Another family member spends in an over-budget category
- **WHEN** one member has already caused a category to exceed 100 percent and another member records a new expense in that category
- **THEN** the second member receives the continued category over-budget alert

#### Scenario: Total budget remains over budget
- **WHEN** a new expense increases total usage that was already at or above 100 percent
- **THEN** the system does not repeat the total-budget over alert unless another higher-priority category alert applies

### Requirement: Budget alert priority is deterministic
The system MUST select at most one compatible `budgetAlert` using category over-budget, total over-budget, category warning, then total warning priority.

#### Scenario: Category and total cross the same threshold
- **WHEN** one expense produces both a category alert and a total-budget alert at the same level
- **THEN** the response contains the category alert

### Requirement: Saved-record feedback is non-blocking
The client SHALL show budget feedback only after the record is saved successfully, without requiring confirmation, and SHALL return to the refreshed home page after approximately two seconds.

#### Scenario: Saved expense returns an over-budget alert
- **WHEN** `record.add` succeeds with a category over-budget alert
- **THEN** the record page shows “记账成功，<分类>预算已超支” and the usage details above the submit button
- **AND** the client prevents another submission during the notice
- **AND** the client automatically returns to the home tab after approximately two seconds

#### Scenario: Record save fails
- **WHEN** `record.add` fails
- **THEN** no success or budget notice is shown
- **AND** the user remains on the record page
