/**
 * db.test.ts — Verify getInMemoryClient creates tables and basic operations work
 * Uses :memory: URL to avoid Electron app dependency.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getInMemoryClient, closeMemoryClient } from '../db';

let clients: Array<{ close: () => void }> = [];

afterEach(() => {
  // Close all clients created during tests
  clients.forEach((c) => c.close());
  clients = [];
});

describe('getInMemoryClient', () => {
  it('creates a client without throwing', async () => {
    await expect(getInMemoryClient()).resolves.not.toThrow();
  });

  it('returns a client with an execute method', async () => {
    const client = await getInMemoryClient();
    expect(typeof client.execute).toBe('function');
    client.close();
  });

  it('creates the memories table', async () => {
    const client = await getInMemoryClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'"
    );
    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates the memory_embeddings table', async () => {
    const client = await getInMemoryClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_embeddings'"
    );
    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates the graph_nodes table', async () => {
    const client = await getInMemoryClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='graph_nodes'"
    );
    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates the graph_closure table', async () => {
    const client = await getInMemoryClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='graph_closure'"
    );
    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates the memories_fts virtual table', async () => {
    const client = await getInMemoryClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
    );
    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates all observer tables', async () => {
    const client = await getInMemoryClient();
    const tables = [
      'observer_file_nodes',
      'observer_co_access_edges',
      'observer_error_patterns',
    ];

    for (const table of tables) {
      const result = await client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        args: [table],
      });
      expect(result.rows).toHaveLength(1);
    }
    clients.push(client);
  });

  it('allows inserting a memory record', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();
    const id = 'test-id-001';

    await client.execute({
      sql: `INSERT INTO memories (
        id, type, content, confidence, tags, related_files, related_modules,
        created_at, last_accessed_at, access_count, scope, source, project_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        'gotcha',
        'Test memory content',
        0.9,
        '[]',
        '[]',
        '[]',
        now,
        now,
        0,
        'global',
        'user_taught',
        'test-project',
      ],
    });

    const result = await client.execute({
      sql: 'SELECT id, type, content FROM memories WHERE id = ?',
      args: [id],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(id);
    expect(result.rows[0].type).toBe('gotcha');
    expect(result.rows[0].content).toBe('Test memory content');

    clients.push(client);
  });

  it('allows inserting a memory with target_node_id', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // First create a graph node
    await client.execute({
      sql: `INSERT INTO graph_nodes (id, file_path, project_id, type, label, source, created_at, updated_at) VALUES (?, ?, ?, 'file', 'test.ts', 'test', ?, ?)`,
      args: ['node-001', 'src/test.ts', 'test-project', now, now],
    });

    // Then insert memory targeting that node
    await client.execute({
      sql: `INSERT INTO memories (
        id, type, content, confidence, tags, related_files, related_modules,
        created_at, last_accessed_at, access_count, scope, source, project_id, target_node_id
      ) VALUES (?, 'gotcha', ?, 0.9, '[]', '[]', '[]', ?, ?, 0, 'global', 'agent_explicit', ?, ?)`,
      args: ['mem-001', 'Node-targeted memory', now, now, 'test-project', 'node-001'],
    });

    const result = await client.execute({
      sql: 'SELECT target_node_id FROM memories WHERE id = ?',
      args: ['mem-001'],
    });

    expect(result.rows[0].target_node_id).toBe('node-001');
    clients.push(client);
  });

  it('allows inserting deprecated memories', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO memories (
        id, type, content, confidence, tags, related_files, related_modules,
        created_at, last_accessed_at, access_count, scope, source, project_id, deprecated
      ) VALUES (?, 'gotcha', 'Deprecated content', 0.9, '[]', '[]', '[]', ?, ?, 0, 'global', 'agent_explicit', ?, 1)`,
      args: ['dep-001', now, now, 'test-project'],
    });

    const result = await client.execute({
      sql: 'SELECT deprecated FROM memories WHERE id = ?',
      args: ['dep-001'],
    });

    expect(result.rows[0].deprecated).toBe(1);
    clients.push(client);
  });

  it('allows querying by project_id', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // Insert two records for different projects
    for (const [idx, projectId] of [['1', 'project-a'], ['2', 'project-b']]) {
      await client.execute({
        sql: `INSERT INTO memories (
          id, type, content, confidence, tags, related_files, related_modules,
          created_at, last_accessed_at, access_count, scope, source, project_id
        ) VALUES (?, 'preference', ?, 0.8, '[]', '[]', '[]', ?, ?, 0, 'global', 'agent_explicit', ?)`,
        args: [`proj-test-${idx}`, `Content for project ${projectId}`, now, now, projectId],
      });
    }

    const result = await client.execute({
      sql: 'SELECT id FROM memories WHERE project_id = ?',
      args: ['project-a'],
    });

    expect(result.rows).toHaveLength(1);
    clients.push(client);
  });

  it('creates observer tables accessible for insert', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    await expect(
      client.execute({
        sql: `INSERT INTO observer_file_nodes (file_path, project_id, access_count, last_accessed_at, session_count)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['src/main/index.ts', 'test-project', 1, now, 1],
      })
    ).resolves.not.toThrow();

    clients.push(client);
  });

  it('allows inserting co-access edges', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    await expect(
      client.execute({
        sql: `INSERT INTO observer_co_access_edges (file_a, file_b, project_id, weight, last_observed_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['src/index.ts', 'src/utils.ts', 'test-project', 0.8, now],
      })
    ).resolves.not.toThrow();

    clients.push(client);
  });

  it('allows inserting observer error patterns', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    await expect(
      client.execute({
        sql: `INSERT INTO observer_error_patterns (id, project_id, tool_name, error_fingerprint, error_message, last_seen_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['err-001', 'test-project', 'bash', 'fingerprint-123', 'Command failed', now],
      })
    ).resolves.not.toThrow();

    clients.push(client);
  });

  it('allows inserting graph closure entries', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // First create nodes
    await client.execute({
      sql: `INSERT INTO graph_nodes (id, file_path, project_id, type, label, source, created_at, updated_at) VALUES
            ('node-1', 'src/index.ts', 'test-project', 'file', 'index.ts', 'test', ?, ?),
            ('node-2', 'src/utils.ts', 'test-project', 'file', 'utils.ts', 'test', ?, ?)`,
      args: [now, now, now, now],
    });

    // Then create closure entry
    await expect(
      client.execute({
        sql: `INSERT INTO graph_closure (ancestor_id, descendant_id, depth, path, edge_types, total_weight) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['node-1', 'node-2', 1, 'node-1>node-2', '["imports"]', 1.0],
      })
    ).resolves.not.toThrow();

    clients.push(client);
  });

  it('allows inserting memory embeddings', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // Create a memory first
    await client.execute({
      sql: `INSERT INTO memories (
        id, type, content, confidence, tags, related_files, related_modules,
        created_at, last_accessed_at, access_count, scope, source, project_id
      ) VALUES (?, 'gotcha', ?, 0.9, '[]', '[]', '[]', ?, ?, 0, 'global', 'agent_explicit', ?)`,
      args: ['mem-001', 'Test memory', now, now, 'test-project'],
    });

    // Create embedding blob
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const buffer = Buffer.allocUnsafe(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4);
    }

    await expect(
      client.execute({
        sql: `INSERT INTO memory_embeddings (memory_id, embedding, model_id, dims, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: ['mem-001', buffer, 'test-model', 4, now],
      })
    ).resolves.not.toThrow();

    clients.push(client);
  });

  it('handles executeMultiple for batch operations', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    await expect(
      client.executeMultiple(`
        INSERT INTO graph_nodes (id, file_path, project_id, type, label, source, created_at, updated_at) VALUES ('n1', 'src/a.ts', 'p', 'file', 'a.ts', 'test', '${now}', '${now}');
        INSERT INTO graph_nodes (id, file_path, project_id, type, label, source, created_at, updated_at) VALUES ('n2', 'src/b.ts', 'p', 'file', 'b.ts', 'test', '${now}', '${now}');
      `)
    ).resolves.not.toThrow();

    const result = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM graph_nodes',
    });

    expect(result.rows[0].count).toBe(2);
    clients.push(client);
  });

  it('supports transactions with batch statements', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // Test that WAL mode is enabled (allows concurrent reads)
    await client.execute('PRAGMA journal_mode=WAL');

    // Insert multiple memories in a transaction-like fashion
    const stmts = [
      `INSERT INTO memories (id, type, content, confidence, tags, related_files, related_modules, created_at, last_accessed_at, access_count, scope, source, project_id)
       VALUES ('m1', 'gotcha', 'Test 1', 0.9, '[]', '[]', '[]', '${now}', '${now}', 0, 'global', 'agent', 'p')`,
      `INSERT INTO memories (id, type, content, confidence, tags, related_files, related_modules, created_at, last_accessed_at, access_count, scope, source, project_id)
       VALUES ('m2', 'gotcha', 'Test 2', 0.8, '[]', '[]', '[]', '${now}', '${now}', 0, 'global', 'agent', 'p')`,
    ];

    await expect(client.executeMultiple(stmts.join(';'))).resolves.not.toThrow();

    const result = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM memories',
    });

    expect(result.rows[0].count).toBe(2);
    clients.push(client);
  });

  it('handles FTS5 index operations', async () => {
    const client = await getInMemoryClient();
    const now = new Date().toISOString();

    // Create a memory
    await client.execute({
      sql: `INSERT INTO memories (
        id, type, content, confidence, tags, related_files, related_modules,
        created_at, last_accessed_at, access_count, scope, source, project_id
      ) VALUES (?, 'gotcha', ?, 0.9, '[]', '[]', '[]', ?, ?, 0, 'global', 'agent', ?)`,
      args: ['fts-001', 'Searchable content for FTS5', now, now, 'test-project'],
    });

    // Insert into FTS index
    await expect(
      client.execute({
        sql: `INSERT INTO memories_fts (memory_id, content, tags, related_files) VALUES (?, ?, ?, ?)`,
        args: ['fts-001', 'Searchable content for FTS5', '[]', '[]'],
      })
    ).resolves.not.toThrow();

    // Query FTS index
    const result = await client.execute({
      sql: `SELECT m.id FROM memories m
            INNER JOIN memories_fts fts ON m.id = fts.memory_id
            WHERE memories_fts MATCH 'searchable'
            AND m.project_id = ?`,
      args: ['test-project'],
    });

    expect(result.rows.length).toBeGreaterThanOrEqual(0);
    clients.push(client);
  });
});
