import { useState, useEffect } from 'react';

export type CloudActionsVersion = 'v1' | 'v2';

const STORAGE_KEY = 'cloud-actions-version';
const DEFAULT_VERSION: CloudActionsVersion = 'v1';

export const useCloudActionsSettings = () => {
  const [version, setVersion] = useState<CloudActionsVersion>(DEFAULT_VERSION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedVersion = localStorage.getItem(STORAGE_KEY) as CloudActionsVersion;
    if (savedVersion && (savedVersion === 'v1' || savedVersion === 'v2')) {
      setVersion(savedVersion);
    }
    setLoading(false);
  }, []);

  const updateVersion = (newVersion: CloudActionsVersion) => {
    setVersion(newVersion);
    localStorage.setItem(STORAGE_KEY, newVersion);
  };

  return {
    version,
    setVersion: updateVersion,
    loading,
    isV2Enabled: version === 'v2'
  };
};