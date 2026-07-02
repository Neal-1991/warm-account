## ADDED Requirements

### Requirement: Application version has one source of truth
The client SHALL expose the application version from a shared configuration module and SHALL display that value on the About page.

#### Scenario: About page is opened
- **WHEN** the user opens the About page in release `3.0.1`
- **THEN** the page displays version `3.0.1` from the shared configuration

### Requirement: Downloaded updates require immediate restart
The client MUST use the WeChat update manager when available and MUST prevent continued use of the current instance after a new version is ready.

#### Scenario: New version is ready
- **WHEN** WeChat reports that a new version has downloaded successfully
- **THEN** the client displays a non-cancelable update prompt
- **AND** confirming the prompt calls `applyUpdate()`

#### Scenario: No update is available
- **WHEN** WeChat reports that no new version is available
- **THEN** the application continues normally without showing an update prompt

### Requirement: Update download failure blocks current use
The client MUST show a non-cancelable blocking message when update download fails and instruct the user to close and reopen the mini program.

#### Scenario: Update download fails
- **WHEN** the update manager reports a download failure
- **THEN** the client displays instructions to close and reopen the mini program
- **AND** dismissing the message does not restore normal interaction with the current instance
