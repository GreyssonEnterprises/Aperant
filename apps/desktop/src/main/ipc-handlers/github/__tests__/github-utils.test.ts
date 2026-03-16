/**
 * Unit tests for GitHub API utility functions
 * Tests githubFetch() error handling, header configuration, and response parsing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubFetch, githubFetchWithRetry, validateGitHubToken } from '../utils';

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

describe('githubFetchWithRetry', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should retry on 500 errors with exponential backoff', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      headers: new Headers()
    };
    const mockSuccess = {
      ok: true,
      status: 200,
      json: async () => ({ data: 'success' }),
      headers: new Headers()
    };

    mockFetch.mockResolvedValueOnce(mockResponse)
                  .mockResolvedValueOnce(mockResponse)
                  .mockResolvedValueOnce(mockSuccess);

    const result = await githubFetchWithRetry('test-token', '/test');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: 'success' });
  }, 10000);

  it('should NOT retry on 401 Unauthorized', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => '{"message": "Bad credentials"}',
      headers: new Headers()
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    await expect(
      githubFetchWithRetry('test-token', '/test')
    ).rejects.toThrow('GitHub API error (401): Bad credentials');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 404 Not Found', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      text: async () => '{"message": "Not Found"}',
      headers: new Headers()
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    await expect(
      githubFetchWithRetry('test-token', '/test')
    ).rejects.toThrow('GitHub API error (404): Not Found');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 429 Rate Limit', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => '{"message": "API rate limit exceeded"}',
      headers: new Headers()
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    await expect(
      githubFetchWithRetry('test-token', '/test')
    ).rejects.toThrow('GitHub API error (429): API rate limit exceeded');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should respect custom maxRetries', async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      headers: new Headers()
    };
    mockFetch.mockResolvedValue(mockResponse);

    await expect(
      githubFetchWithRetry('test-token', '/test', {}, 1)
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry on 502 Bad Gateway', async () => {
    const mockResponse = {
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
      headers: new Headers()
    };
    const mockSuccess = {
      ok: true,
      status: 200,
      json: async () => ({ data: 'success' }),
      headers: new Headers()
    };

    mockFetch.mockResolvedValueOnce(mockResponse)
                  .mockResolvedValueOnce(mockSuccess);

    const result = await githubFetchWithRetry('test-token', '/test');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 'success' });
  });

  it('should retry on 503 Service Unavailable', async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      headers: new Headers()
    };
    const mockSuccess = {
      ok: true,
      status: 200,
      json: async () => ({ data: 'success' }),
      headers: new Headers()
    };

    mockFetch.mockResolvedValueOnce(mockResponse)
                  .mockResolvedValueOnce(mockSuccess);

    const result = await githubFetchWithRetry('test-token', '/test');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 'success' });
  });

  it('should throw after max retries exhausted', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      headers: new Headers()
    };
    mockFetch.mockResolvedValue(mockResponse);

    await expect(
      githubFetchWithRetry('test-token', '/test', {}, 2)
    ).rejects.toThrow('GitHub API error (500): Internal Server Error');

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should pass custom options to githubFetch', async () => {
    const mockSuccess = {
      ok: true,
      status: 200,
      json: async () => ({ data: 'success' }),
      headers: new Headers()
    };
    mockFetch.mockResolvedValueOnce(mockSuccess);

    const result = await githubFetchWithRetry('test-token', '/test', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' })
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ test: 'data' })
      })
    );
    expect(result).toEqual({ data: 'success' });
  });
});

describe('validateGitHubToken', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should return valid: true for good token', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ login: 'testuser' }),
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await validateGitHubToken('good-token');

    expect(result).toEqual({ valid: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer good-token',
          'User-Agent': 'Aperant'
        })
      })
    );
  });

  it('should return valid: false with error message for 401', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => '{"message": "Bad credentials"}',
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await validateGitHubToken('bad-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
    expect(result.error).toContain('Bad credentials');
  });

  it('should return valid: false for 403 Forbidden', async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      text: async () => '{"message": "Forbidden"}',
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await validateGitHubToken('expired-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('403');
  });

  it('should handle network errors', async () => {
    // Mock all retry attempts (4 total: initial + 3 retries) since improved error classification now detects this as retryable
    for (let i = 0; i < 4; i++) {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
    }

    const result = await validateGitHubToken('test-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Network error');
  }, 10000); // Increase timeout to accommodate retry delays (1s + 2s + 4s = 7s total)

  it('should handle empty token safely', async () => {
    const result = await validateGitHubToken('');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token is empty');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should mark 5xx errors as retryable', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
    // Provide 4 mocks for retry attempts (0, 1, 2, 3)
    mockFetch.mockResolvedValueOnce(mockResponse);
    mockFetch.mockResolvedValueOnce(mockResponse);
    mockFetch.mockResolvedValueOnce(mockResponse);
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await validateGitHubToken('test-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('500');
    expect(result.retryable).toBe(true);
  }, 10000); // 10s timeout to accommodate retry delays

  it('should handle failed text() parsing with fallback', async () => {
    // Create fresh mock objects for each retry attempt
    const createMockResponse = () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('Parse error');
      },
    });
    // Provide 4 mocks for retry attempts (0, 1, 2, 3)
    mockFetch.mockResolvedValueOnce(createMockResponse());
    mockFetch.mockResolvedValueOnce(createMockResponse());
    mockFetch.mockResolvedValueOnce(createMockResponse());
    mockFetch.mockResolvedValueOnce(createMockResponse());

    const result = await validateGitHubToken('test-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown error');
    expect(result.retryable).toBe(true);
  }, 10000); // 10s timeout to accommodate retry delays

  it('should mark 401/403 as non-retryable auth failures', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => 'Bad credentials',
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await validateGitHubToken('test-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid credentials');
    expect(result.retryable).toBe(false);
  });
});
