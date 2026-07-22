/**
 * Common utility types shared across the application
 */

// IPC Types
export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  errorCode?: string;
  error?: string;
}
