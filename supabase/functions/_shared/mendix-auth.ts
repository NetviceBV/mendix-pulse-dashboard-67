// Mendix API-keys are deprecated (end of support: 2027-01-01). Prefer PAT via "MxToken".
export function mendixAuthHeaders(credential: { username?: string | null; api_key?: string | null; pat?: string | null }): Record<string, string> {
  if (credential?.pat && credential.pat.trim()) {
    return { Authorization: `MxToken ${credential.pat.trim()}` };
  }
  console.warn('[mendix-auth] No PAT configured; falling back to deprecated Mendix API key headers');
  return {
    'Mendix-Username': credential?.username || '',
    'Mendix-ApiKey': credential?.api_key || '',
  };
}
