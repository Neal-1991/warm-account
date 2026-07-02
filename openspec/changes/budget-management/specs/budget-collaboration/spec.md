## ADDED Requirements

### Requirement: Budget visibility and edit permissions
The system SHALL allow every member of a book to view its budgets and SHALL allow only the book owner to create, update, copy or delete them.

#### Scenario: Member views family budget
- **WHEN** a non-owner book member requests a monthly budget
- **THEN** the system returns the budget and usage with edit permission disabled

#### Scenario: Member attempts to edit
- **WHEN** a non-owner attempts a budget mutation
- **THEN** the server rejects the operation with a permission error

### Requirement: Protect active budget category references
The system MUST prevent deletion of an expense big category referenced by a current or future budget.

#### Scenario: Referenced big category deletion
- **WHEN** a user attempts to delete a big category referenced by the current or a future month budget
- **THEN** the system rejects deletion and identifies that the category is used by a budget

#### Scenario: Historical reference does not block deletion
- **WHEN** a big category is referenced only by historical budgets and otherwise meets deletion rules
- **THEN** the system allows deletion and historical budget display uses the saved snapshot

### Requirement: Family merge preserves the target budget
The system SHALL keep the target family budgets unchanged and SHALL not migrate or combine the source book budgets during a family join.

#### Scenario: Source book joins a family
- **WHEN** the join migration completes
- **THEN** the source book budgets are deleted and the target book budgets retain their original amounts and categories

### Requirement: Environment lifecycle includes budgets
The system SHALL include budget collections in environment setup guidance and test or production reset cleanup.

#### Scenario: Environment data is cleared
- **WHEN** the protected clear-data function runs for an environment
- **THEN** all budget documents in that environment are removed with the other accounting data
