export const queryKeys = {
  apps: ['apps'] as const,
  environments: ['environments'] as const,
  appsWithEnvironments: ['apps-with-environments'] as const,
  cloudActions: ['cloud-actions'] as const,
  credentials: ['credentials'] as const,
  webhookLogs: (appId: string, env: string) => ['webhook-logs', appId, env] as const,
  owaspItems: (appId: string) => ['owasp-items', appId] as const,
  vulnerabilities: (appId: string) => ['vulnerabilities', appId] as const,
  linting: (appId: string) => ['linting', appId] as const,
};
