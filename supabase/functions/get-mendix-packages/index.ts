import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const { credentialId, appId, branchName } = await req.json();

    if (!credentialId || !appId || !branchName) {
      throw new Error('Missing required parameters');
    }

    // Get user's credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Credentials not found or access denied');
    }

    // Get app version to determine MX9 vs MX10 behavior
    const { data: appRow, error: appError } = await supabase
      .from('mendix_apps')
      .select('version')
      .eq('app_id', appId)
      .eq('user_id', user.id)
      .single();

    if (appError) {
      console.log('Could not fetch app version, proceeding with defaults');
    }

    const version: string | undefined = appRow?.version || undefined;

    function isMx10(ver?: string): boolean {
      if (!ver) return false;
      // Heuristic: MX10 package versions often end with a git hash (hex)
      const gitHashPattern = /[a-f0-9]{6,}$/i;
      return gitHashPattern.test(ver);
    }

    const mx10 = isMx10(version);
    const targetBranch = String(branchName || '').toLowerCase().trim();

    // Build prefix to filter package names
    // MX9: main line packages are prefixed with "Main line-...", MX10 uses e.g. "main-..."
    let namePrefix = `${targetBranch}-`;
    if (!mx10 && targetBranch === 'trunk') {
      namePrefix = 'main line-';
    }

    const url = `https://deploy.mendix.com/api/1/apps/${appId}/packages`;
    console.log(`Fetching packages for app ${appId} (branch: ${branchName}, prefix: ${namePrefix}, mx10=${mx10})`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Mendix-Username': credentials.username,
        'Mendix-ApiKey': credentials.api_key || credentials.pat || ''
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch packages: ${response.status} - ${errorText}`);
      throw new Error(`Failed to fetch packages: ${response.status}`);
    }

    const packages = await response.json();
    if (!Array.isArray(packages)) {
      throw new Error('Unexpected packages response format');
    }

    // Normalize and filter by branch prefix
    type Pkg = { Name?: string; name?: string; CreationDate?: string };
    const filtered = (packages as Pkg[])
      .map(p => ({
        name: (p.Name || p.name || '').toString(),
        created: p.CreationDate ? new Date(p.CreationDate).getTime() : undefined,
      }))
      .filter(p => p.name && p.name.toLowerCase().startsWith(namePrefix))
      .sort((a, b) => {
        if (a.created && b.created) return b.created - a.created; // newest first
        if (a.created && !b.created) return -1;
        if (!a.created && b.created) return 1;
        // fallback to name desc
        return b.name.localeCompare(a.name);
      });

    const names = filtered.map(p => p.name);

    return new Response(
      JSON.stringify({ success: true, packages: names }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-mendix-packages:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as any).message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
