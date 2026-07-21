import { app } from 'electron';
import path from 'node:path';
import type { ProviderAccount } from '@shared/types/provider-account';
import { readSettingsFile } from '../settings-utils';
import { createModelCatalogService, type ModelCatalogService } from './model-catalog-service';

let service: ModelCatalogService | undefined;

export function getModelCatalogService(): ModelCatalogService {
  if (!service) {
    service = createModelCatalogService({
      cachePath: path.join(app.getPath('userData'), 'model-catalog.json'),
      fetch: globalThis.fetch,
      now: Date.now,
      readAccounts: () => {
        const settings = readSettingsFile();
        return (settings?.providerAccounts as ProviderAccount[] | undefined) ?? [];
      },
    });
  }
  return service;
}
