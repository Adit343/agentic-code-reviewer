import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateSha, validateLocalPath, validateRepositoryExistence } from '../../src/services/repository/acquisition';

describe('Repository Acquisition Validation Tests', () => {
  it('validates correct 40-character and 7-character commit SHAs', () => {
    expect(validateSha('8f31a92')).toBe(true);
    expect(validateSha('8f31a9214567890abcdef1234567890abcdef123')).toBe(true);
    expect(validateSha('HEAD')).toBe(true);
    expect(validateSha('invalid_sha_xyz')).toBe(false);
    expect(validateSha('../path/traversal')).toBe(false);
  });

  it('validates canonical local paths and rejects invalid relative paths', () => {
    const cwd = process.cwd();
    const valid = validateLocalPath(cwd);
    expect(valid).toBe(path.resolve(cwd));
  });

  it('validates existing local project directory successfully', async () => {
    const result = await validateRepositoryExistence('.', 'local');
    expect(result.valid).toBe(true);
    expect(result.resolvedPath).toBe(path.resolve('.'));
  });

  it('returns user-friendly error for non-existent local directory', async () => {
    const fakePath = path.join(process.cwd(), 'non_existent_folder_xyz_99999');
    const result = await validateRepositoryExistence(fakePath, 'local');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Local repository path does not exist');
  });

  it('returns user-friendly error for empty repository source', async () => {
    const result = await validateRepositoryExistence('', 'local');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Repository source cannot be empty');
  });

  it('returns user-friendly error for invalid GitHub format', async () => {
    const result = await validateRepositoryExistence('not-an-owner-repo', 'github');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid GitHub repository format');
  });

  it('returns user-friendly error for non-existent GitHub repository', async () => {
    const result = await validateRepositoryExistence('nonexistent-owner-abc-99999/fake-repo-xyz-99999', 'github');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('was not found or is private');
  });

  it('returns user-friendly error for non-existent GitLab repository', async () => {
    const result = await validateRepositoryExistence('nonexistent-owner-abc-99999/fake-repo-xyz-99999', 'gitlab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('was not found or is private');
  });

  it('returns user-friendly error for invalid Git URL scheme', async () => {
    const result = await validateRepositoryExistence('ftp://invalid-server.com/repo.git', 'url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported or invalid Git URL scheme');
  });
});
