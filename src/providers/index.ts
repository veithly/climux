/**
 * Provider Registry
 * Central registry for all CLI providers
 */

import type { Provider, ProviderConfig } from '../types/index.js';
import { ClaudeCodeProvider } from './claude-code.js';
import { CodexProvider } from './codex.js';
import { GeminiCliProvider } from './gemini-cli.js';
import { OpenCodeProvider } from './opencode.js';

export { BaseProvider } from './base.js';
export { ClaudeCodeProvider } from './claude-code.js';
export { CodexProvider } from './codex.js';
export { GeminiCliProvider } from './gemini-cli.js';
export { OpenCodeProvider } from './opencode.js';

/**
 * Provider factory function type
 */
type ProviderFactory = (config?: ProviderConfig) => Provider;

/**
 * Registry of all available providers
 */
const providerFactories: Map<string, ProviderFactory> = new Map([
  ['claude-code', (config) => new ClaudeCodeProvider(config)],
  ['codex', (config) => new CodexProvider(config)],
  ['gemini-cli', (config) => new GeminiCliProvider(config)],
  ['opencode', (config) => new OpenCodeProvider(config)],
]);

/**
 * Provider instances cache
 */
const providerInstances: Map<string, Provider> = new Map();

/**
 * Register a new provider
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  providerFactories.set(name, factory);
}

/**
 * Get a provider instance by name
 */
export function getProvider(name: string, config?: ProviderConfig): Provider | undefined {
  // Check cache first
  if (providerInstances.has(name) && !config) {
    return providerInstances.get(name);
  }

  // Get factory
  const factory = providerFactories.get(name);
  if (!factory) {
    return undefined;
  }

  // Create instance
  const provider = factory(config);

  // Cache if no custom config
  if (!config) {
    providerInstances.set(name, provider);
  }

  return provider;
}

/**
 * Get all registered provider names
 */
export function getProviderNames(): string[] {
  return Array.from(providerFactories.keys());
}

/**
 * Check if a provider is registered
 */
export function hasProvider(name: string): boolean {
  return providerFactories.has(name);
}

/**
 * Get all available (installed) providers
 */
export async function getAvailableProviders(): Promise<Provider[]> {
  const available: Provider[] = [];

  for (const name of providerFactories.keys()) {
    const provider = getProvider(name);
    if (provider && await provider.detect()) {
      available.push(provider);
    }
  }

  return available;
}

/**
 * Get all available provider names
 */
export async function getAvailableProviderNames(): Promise<string[]> {
  const available: string[] = [];

  for (const name of providerFactories.keys()) {
    const provider = getProvider(name);
    if (provider && await provider.detect()) {
      available.push(name);
    }
  }

  return available;
}

/**
 * Create providers from config
 */
export function createProvidersFromConfig(
  configs: Record<string, ProviderConfig>
): Map<string, Provider> {
  const providers = new Map<string, Provider>();

  for (const [name, config] of Object.entries(configs)) {
    if (config.enabled !== false) {
      const provider = getProvider(name, config);
      if (provider) {
        providers.set(name, provider);
      }
    }
  }

  return providers;
}
