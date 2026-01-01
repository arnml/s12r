/**
 * Simple dependency injection container for S12R services.
 * Provides centralized service management and configuration.
 */

import { TryLedger } from '@/utils/try-ledger';
import { S12RErrorHandler } from '@/utils/error-handler';

export interface ServiceConfig {
  enableDebugLogging: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDirectory?: string;
}

export class ServiceContainer {
  private services = new Map<string, any>();
  private config: ServiceConfig;

  constructor(config: Partial<ServiceConfig> = {}) {
    this.config = {
      enableDebugLogging: false,
      ...config,
    };
  }

  /**
   * Register a service instance.
   */
  register<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  /**
   * Get a service instance.
   */
  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found in container`);
    }
    return service;
  }

  /**
   * Create a new TryLedger with container configuration.
   */
  createLedger(traceId?: string): TryLedger {
    return new TryLedger(traceId, this.config.enableDebugLogging);
  }

  /**
   * Get configuration value.
   */
  getConfig(): ServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<ServiceConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Global service container instance
let globalContainer: ServiceContainer | null = null;

export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
  }
  return globalContainer;
}

export function setServiceContainer(container: ServiceContainer): void {
  globalContainer = container;
}