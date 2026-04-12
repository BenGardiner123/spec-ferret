// Fixture: throws synchronously at module top-level.
// Used to verify that extractFromContractFile() does not swallow import errors.
throw new Error('intentional module-level throw');
