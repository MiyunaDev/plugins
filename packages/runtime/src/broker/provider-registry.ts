/**
 * @file provider-registry.ts
 * Structured registry and lifecycle manager for host and native capability providers.
 */

import { CapabilitySummary } from '../../../contracts/src/rpc.js';

export interface ICapabilityProvider {
  readonly name: string;
  readonly version?: string;
  readonly supportedActions?: string[];

  /**
   * Dispatches a typed capability operation invocation from an authorized plugin.
   */
  handle(
    action: string,
    args: Record<string, unknown> | undefined,
    pluginId: string
  ): Promise<unknown>;

  /**
   * Lifecycle hook invoked when the provider is registered with the host broker.
   */
  onRegister?(context: ProviderRegistrationContext): void | Promise<void>;

  /**
   * Lifecycle hook invoked when the provider is unregistered or the host is shutting down.
   */
  onUnregister?(): void | Promise<void>;
}

export interface ProviderRegistrationContext {
  emitEvent(topic: string, payload: unknown, targetPluginId?: string): void;
}

export class ProviderRegistry {
  private providers = new Map<string, ICapabilityProvider>();
  private eventEmitters = new Set<(topic: string, payload: unknown, targetPluginId?: string) => void>();

  public onEmitEvent(callback: (topic: string, payload: unknown, targetPluginId?: string) => void): () => void {
    this.eventEmitters.add(callback);
    return () => this.eventEmitters.delete(callback);
  }

  public emitEvent(topic: string, payload: unknown, targetPluginId?: string): void {
    for (const emitter of this.eventEmitters) {
      try {
        emitter(topic, payload, targetPluginId);
      } catch (err) {
        console.error(`Error emitting provider event '${topic}':`, err);
      }
    }
  }

  /**
   * Registers a capability provider with the host registry and invokes its lifecycle hook.
   */
  public async register(provider: ICapabilityProvider): Promise<void> {
    if (!provider.name) {
      throw new Error("Provider must define a non-empty 'name' property");
    }

    if (this.providers.has(provider.name)) {
      throw new Error(`Capability provider '${provider.name}' is already registered`);
    }

    this.providers.set(provider.name, provider);

    if (provider.onRegister) {
      await provider.onRegister({
        emitEvent: (topic, payload, targetPluginId) => this.emitEvent(topic, payload, targetPluginId),
      });
    }
  }

  /**
   * Unregisters a capability provider and invokes its teardown hook.
   */
  public async unregister(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;

    if (provider.onUnregister) {
      try {
        await provider.onUnregister();
      } catch (err) {
        console.warn(`Error during onUnregister for provider '${name}':`, err);
      }
    }

    return this.providers.delete(name);
  }

  public get(name: string): ICapabilityProvider | undefined {
    return this.providers.get(name);
  }

  public has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Returns metadata summaries for all currently registered capabilities.
   */
  public list(): CapabilitySummary[] {
    const list: CapabilitySummary[] = [];
    for (const [name, provider] of this.providers.entries()) {
      list.push({
        name,
        available: true,
        version: provider.version ?? '1.0.0',
        supportedActions: provider.supportedActions ? [...provider.supportedActions] : [],
      });
    }
    return list;
  }
}
