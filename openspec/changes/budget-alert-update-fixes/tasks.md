## 1. Budget Backend

- [x] 1.1 Return a stable missing-previous-budget error code from the budget cloud function
- [x] 1.2 Extend category alert calculation for continued overspend and deterministic priority
- [x] 1.3 Preserve the compatible single `budgetAlert` response with a trigger field

## 2. Mini Program Feedback

- [x] 2.1 Fix copy-previous loading and toast ordering on the budget page
- [x] 2.2 Replace the blocking budget dialog with a non-blocking record-page notice
- [x] 2.3 Lock repeated submission, clean timers and automatically return to the refreshed home tab

## 3. Client Update Management

- [x] 3.1 Add shared application version configuration and dynamic About-page display
- [x] 3.2 Register update-ready and update-failed blocking flows during application launch

## 4. Verification and Documentation

- [x] 4.1 Add automated coverage for budget error feedback, continued overspend, notice behavior and update management
- [x] 4.2 Run the full automated suite and package quality checks
- [x] 4.3 Update design, memo, issues and testcase documentation
