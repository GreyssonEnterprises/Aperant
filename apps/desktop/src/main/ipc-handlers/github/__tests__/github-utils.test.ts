/**
 * Unit tests for GitHub API utility functions
 * Tests githubFetch() error handling, header configuration, and response parsing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubFetch } from '../utils';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('githubFetch', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('successful requests', () => {
    it('should successfully fetch data from GitHub API with proper headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test', id: 123 }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await githubFetch('test-token', '/repos/test/repo/issues');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test/repo/issues',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github+json',
            'Authorization': 'Bearer test-token',
            'User-Agent': 'Aperant'
          })
        })
      );
      expect(result).toEqual({ data: 'test', id: 123 });
    });

    it('should handle full URLs without prefixing', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await githubFetch('test-token', 'https://api.github.com/users/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/users/test',
        expect.any(Object)
      );
    });

    it('should pass through custom options', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await githubFetch('test-token', '/test', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' })
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ test: 'data' })
        })
      );
    });

    it('should handle empty token safely', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await githubFetch('', '/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer '
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw detailed error for 500 Internal Server Error', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error: Database connection failed',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (500): Internal Server Error: Database connection failed');
    });

    it('should throw detailed error for 401 Unauthorized', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: async () => '{"message": "Bad credentials", "documentation_url": "https://docs.github.com/rest"}',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('invalid-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (401): Bad credentials');
    });

    it('should throw detailed error for 404 Not Found', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: async () => '{"message": "Not Found", "documentation_url": "https://docs.github.com/rest"}',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/nonexistent/repo/issues')
      ).rejects.toThrow('GitHub API error (404): Not Found');
    });

    it('should throw detailed error for 429 Rate Limit', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        text: async () => '{"message": "API rate limit exceeded for user ID 123", "documentation_url": "https://docs.github.com/rest"}',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (429): API rate limit exceeded for user ID 123');
    });

    it('should handle empty response body in error case', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => '',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (500):');
    });

    it('should handle failed text() parsing with fallback message', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        text: async () => {
          throw new Error('Network error');
        },
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (503): Request failed');
    });

    it('should include User-Agent header in error requests', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Server Error',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      try {
        await githubFetch('test-token', '/test');
      } catch (e) {
        // Expected to throw
      }

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Aperant'
          })
        })
      );
    });

    it('should handle HTML error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 502,
        text: async () => '<html><body>Bad Gateway</body></html>',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (502): <html><body>Bad Gateway</body></html>');
    });

    it('should handle JSON error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        text: async () => '{"message": "Validation Failed", "errors": [{"resource": "Issue", "field": "title", "code": "missing"}]}',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/repos/test/repo/issues')
      ).rejects.toThrow('GitHub API error (422): Validation Failed');
    });

    it('should preserve error details with status and body', async () => {
      const errorBody = '{"message": "Repository access denied", "documentation_url": "https://docs.github.com/rest"}';
      const mockResponse = {
        ok: false,
        status: 403,
        text: async () => errorBody,
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      try {
        await githubFetch('test-token', '/repos/private/repo/issues');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('403');
        expect((error as Error).message).toContain('Repository access denied');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle response with no body text', async () => {
      const mockResponse = {
        ok: false,
        status: 204,
        text: async () => '',
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        githubFetch('test-token', '/test')
      ).rejects.toThrow('GitHub API error (204):');
    });

    it('should handle null token', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await githubFetch(null as unknown as string, '/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer '
          })
        })
      );
    });

    it('should handle undefined token', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await githubFetch(undefined as unknown as string, '/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer '
          })
        })
      );
    });
  });
});
