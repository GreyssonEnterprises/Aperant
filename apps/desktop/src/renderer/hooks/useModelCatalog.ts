import { useEffect, useMemo, useState } from 'react';
import { BUNDLED_MODEL_CATALOG } from '@shared/constants/model-catalog';
import type { ModelCatalogQuery, ModelDescriptor } from '@shared/types/model-catalog';
import { toCatalogModelOptions } from '../lib/model-catalog-options';

export function useModelCatalog(query: ModelCatalogQuery = {}) {
  const [models, setModels] = useState<ModelDescriptor[]>(BUNDLED_MODEL_CATALOG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const provider = query.provider;
  const accountId = query.accountId;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    window.electronAPI.listModelCatalog({
      ...(provider ? { provider } : {}),
      ...(accountId ? { accountId } : {}),
    }).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setModels(result.data.models);
        setError(undefined);
      } else {
        setError(result.error ?? 'Unable to load model catalog');
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [provider, accountId]);

  const options = useMemo(() => toCatalogModelOptions(models), [models]);
  return { models, options, isLoading, error };
}
