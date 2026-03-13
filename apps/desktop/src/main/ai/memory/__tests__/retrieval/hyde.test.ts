/**
 * hyde.test.ts — Tests for Hypothetical Document Embeddings (HyDE) fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydeSearch } from '../../retrieval/hyde';
import type { EmbeddingService } from '../../embedding-service';
import type { LanguageModel } from 'ai';
import { generateText } from 'ai';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('hydeSearch', () => {
  let mockEmbeddingService: EmbeddingService;
  let mockModel: LanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEmbeddingService = {
      embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
      embedBatch: vi.fn().mockResolvedValue([]),
      embedMemory: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
      embedChunk: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn().mockReturnValue('test'),
    } as unknown as EmbeddingService;

    mockModel = {} as LanguageModel;
  });

  it('generates hypothetical document and embeds it', async () => {
    const hypotheticalDoc = 'The authentication middleware validates JWT tokens using the verifyJwt function.';
    vi.mocked(generateText).mockResolvedValue({
      text: hypotheticalDoc,
      usage: { totalTokens: 50, promptTokens: 30, completionTokens: 20 } as any,
      finishReason: 'stop',
      warnings: undefined,
    } as any);

    const result = await hydeSearch('how does auth middleware validate tokens?', mockEmbeddingService, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('how does auth middleware validate tokens?'),
      maxOutputTokens: 100,
    });
    expect(mockEmbeddingService.embed).toHaveBeenCalledWith(hypotheticalDoc, 1024);
    expect(result).toEqual(new Array(1024).fill(0.1));
  });

  it('falls back to embedding original query when generation fails', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('AI service unavailable'));

    const query = 'test query';
    const result = await hydeSearch(query, mockEmbeddingService, mockModel);

    expect(generateText).toHaveBeenCalled();
    expect(mockEmbeddingService.embed).toHaveBeenCalledWith(query, 1024);
    expect(result).toEqual(new Array(1024).fill(0.1));
  });

  it('falls back to embedding original query when hypothetical text is empty', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '   ', // Only whitespace
      usage: { totalTokens: 10, promptTokens: 5, completionTokens: 20 } as any,
      finishReason: 'stop',
      warnings: undefined,
    } as any);

    const query = 'test query';
    await hydeSearch(query, mockEmbeddingService, mockModel);

    expect(mockEmbeddingService.embed).toHaveBeenCalledWith(query, 1024);
  });

  it('returns 1024-dimensional embedding', async () => {
    const customEmbedding = new Array(1024).fill(0.5);
    mockEmbeddingService.embed = vi.fn().mockResolvedValue(customEmbedding);

    vi.mocked(generateText).mockResolvedValue({
      text: 'Test content',
      usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 } as any,
      finishReason: 'stop',
      warnings: undefined,
    } as any);

    const result = await hydeSearch('test', mockEmbeddingService, mockModel);

    expect(result).toHaveLength(1024);
    expect(result).toEqual(customEmbedding);
  });
});
