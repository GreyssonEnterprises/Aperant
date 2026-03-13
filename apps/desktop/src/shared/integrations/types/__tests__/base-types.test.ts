import { describe, it, expect } from 'vitest';
import type { IntegrationError, SyncStatus, InvestigationStatus } from '../base-types';

describe('base-types', () => {
  it('should create IntegrationError', () => {
    const error: IntegrationError = {
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      recoverable: true
    };
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.recoverable).toBe(true);
  });

  it('should create SyncStatus', () => {
    const status: SyncStatus = {
      connected: true,
      repoFullName: 'group/project'
    };
    expect(status.connected).toBe(true);
  });

  it('should create InvestigationStatus', () => {
    const status: InvestigationStatus = {
      phase: 'fetching',
      progress: 50,
      message: 'Analyzing...'
    };
    expect(status.phase).toBe('fetching');
  });
});
