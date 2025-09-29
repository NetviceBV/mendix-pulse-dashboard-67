// Utility functions for handling TypeScript strict error types

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// For legacy compatibility with existing code that expects error.message
export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('Unknown error occurred');
}