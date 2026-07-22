import type { ModelDescriptor } from '../types/model-catalog';

export function isCodexSubscriptionModel(
  descriptor: Pick<ModelDescriptor, 'provider' | 'backend' | 'id'>,
): boolean {
  return descriptor.provider === 'openai' &&
    (descriptor.backend === 'codex-app-server' || descriptor.id.toLowerCase().includes('codex'));
}
