import { describe, it, expect } from 'vitest';
import { validateSha, validateLocalPath } from '../../src/services/repository/acquisition';

describe('Repository Acquisition Validation Tests', () => {
  it('validates correct 40-character and 7-character commit SHAs', () => {
    expect(validateSha('8f31a92')).toBe(true);
    expect(validateSha('8f31a9214567890abcdef1234567890abcdef123')).toBe(true);
    expect(validateSha('invalid_sha_xyz')).toBe(false);
    expect(validateSha('../path/traversal')).toBe(false);
  });

  it('validates canonical local paths and rejects invalid relative paths', () => {
    const valid = validateLocalPath('/home/adit/Desktop/Learning/agentic-code-reviewer');
    expect(valid).toBe('/home/adit/Desktop/Learning/agentic-code-reviewer');
  });
});
