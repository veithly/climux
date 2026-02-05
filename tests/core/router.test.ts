import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Provider, Config } from '../../src/types/index.js';
import { Router } from '../../src/core/Router.js';

const mockState = vi.hoisted(() => ({
  providers: new Map<string, Provider>(),
}));

vi.mock('../../src/providers/index.js', () => ({
  createProvidersFromConfig: () => mockState.providers,
  getProviderNames: () => Array.from(mockState.providers.keys()),
}));

const baseConfig: Config = {
  defaultProvider: 'preferred',
  routing: [],
  fallbackOrder: [],
  concurrency: {
    maxActiveSessions: 1,
    maxSessionsPerWorkspace: 1,
  },
  monitoring: {
    trackTokens: false,
    trackCost: false,
    trackGitChanges: false,
    runQualityChecks: false,
  },
  retention: {
    sessionLogs: '1d',
    completedSessions: '1d',
  },
  providers: {},
};

function makeProvider(name: string, available: boolean): Provider {
  return {
    name,
    command: name,
    capabilities: {
      chat: false,
      task: false,
      resume: false,
      streaming: false,
      mcp: false,
      skills: false,
    },
    detect: vi.fn().mockResolvedValue(available),
    buildArgs: () => [],
    buildResumeArgs: () => [],
    parseOutput: () => ({}),
    isTaskComplete: () => false,
    getMcpConfigPath: () => undefined,
    getSkillsConfigPath: () => undefined,
    getEnv: () => ({}),
  };
}

describe('Router selectProvider', () => {
  beforeEach(() => {
    mockState.providers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('selects the preferred provider when available', async () => {
    const preferredProvider = makeProvider('preferred', true);
    const ruleProvider = makeProvider('rule', true);

    mockState.providers.set('preferred', preferredProvider);
    mockState.providers.set('rule', ruleProvider);

    const config: Config = {
      ...baseConfig,
      routing: [{ pattern: 'test', provider: 'rule' }],
      fallbackOrder: ['rule'],
      providers: {
        preferred: { name: 'preferred', command: 'preferred', enabled: true },
        rule: { name: 'rule', command: 'rule', enabled: true },
      },
    };

    const router = new Router(config);
    const selected = await router.selectProvider('test task', 'preferred');

    expect(selected).toBe(preferredProvider);
    expect(preferredProvider.detect).toHaveBeenCalledTimes(1);
    expect(ruleProvider.detect).not.toHaveBeenCalled();
  });
});
