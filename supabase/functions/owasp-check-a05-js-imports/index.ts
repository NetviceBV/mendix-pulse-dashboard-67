import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  status: 'pass' | 'fail' | 'warning' | 'error';
  details: string;
  scripts?: {
    src: string;
    isVanilla: boolean;
    isUserWhitelisted: boolean;
    matchedPattern?: string;
  }[];
  nonWhitelistedScripts?: string[];
}

// Built-in vanilla Mendix patterns
const VANILLA_MENDIX_PATTERNS = [
  /^mxclientsystem\//i,
  /^mxui\//i,
  /^dojo\//i,
  /^dijit\//i,
  /^mxui\.js$/i,
  /^widgets\//i,
  /^\.\//, // Relative paths starting with ./
  /^\.\.\//, // Relative paths starting with ../
  /^\//, // Absolute paths from root
  /mendixcloud\.com/i,
  /mendix\.com/i,
  /^lib\//i,
];

function isVanillaMendixScript(src: string): boolean {
  // Check against built-in patterns
  for (const pattern of VANILLA_MENDIX_PATTERNS) {
    if (pattern.test(src)) {
      return true;
    }
  }
  
  // Scripts without protocol (same-origin) are typically safe
  if (!src.includes('://') && !src.startsWith('//')) {
    return true;
  }
  
  return false;
}

function matchesUserWhitelist(src: string, whitelist: string[]): string | null {
  for (const pattern of whitelist) {
    // Support simple wildcard matching
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\\\*/g, '.*'); // Convert * to .*
    
    try {
      const regex = new RegExp(regexPattern, 'i');
      if (regex.test(src)) {
        return pattern;
      }
    } catch {
      // If pattern is invalid, try exact match
      if (src.toLowerCase().includes(pattern.toLowerCase())) {
        return pattern;
      }
    }
  }
  return null;
}

function extractScriptSources(html: string): string[] {
  const scripts: string[] = [];
  
  // Match <script src="..."> tags
  const scriptRegex = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1].trim();
    if (src) {
      scripts.push(src);
    }
  }
  
  return scripts;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id, environment_name, user_id } = await req.json();

    console.log(`[A05 JS Import Check] Starting check for project: ${project_id}, env: ${environment_name}`);

    if (!project_id || !user_id) {
      return new Response(
        JSON.stringify({ status: 'error', details: 'Missing required parameters: project_id and user_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get production environment URL
    const { data: environment, error: envError } = await supabase
      .from('mendix_environments')
      .select('url, environment_name')
      .eq('app_id', project_id)
      .eq('user_id', user_id)
      .ilike('environment_name', 'Production')
      .maybeSingle();

    if (envError) {
      console.error('[A05 JS Import Check] Error fetching environment:', envError);
      return new Response(
        JSON.stringify({ status: 'error', details: `Database error: ${envError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!environment?.url) {
      console.log('[A05 JS Import Check] No production environment URL found');
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: 'No production environment URL found. Cannot check JavaScript imports.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's whitelist
    const { data: whitelistEntries, error: whitelistError } = await supabase
      .from('owasp_js_whitelist')
      .select('script_pattern')
      .eq('user_id', user_id)
      .eq('app_id', project_id);

    if (whitelistError) {
      console.error('[A05 JS Import Check] Error fetching whitelist:', whitelistError);
    }

    const userWhitelist = (whitelistEntries || []).map(e => e.script_pattern);
    console.log(`[A05 JS Import Check] User whitelist has ${userWhitelist.length} entries`);

    // Fetch index.html from production environment
    const indexUrl = environment.url.endsWith('/') 
      ? `${environment.url}index.html` 
      : `${environment.url}/index.html`;

    console.log(`[A05 JS Import Check] Fetching: ${indexUrl}`);

    let htmlContent: string;
    try {
      const response = await fetch(indexUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'OWASP-Security-Check/1.0',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        console.log(`[A05 JS Import Check] Failed to fetch index.html: ${response.status}`);
        return new Response(
          JSON.stringify({ 
            status: 'warning', 
            details: `Could not fetch index.html (HTTP ${response.status}). The application may be offline or protected.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      htmlContent = await response.text();
    } catch (fetchError) {
      console.error('[A05 JS Import Check] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: `Could not fetch index.html: ${fetchError instanceof Error ? fetchError.message : 'Network error'}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract script sources
    const scriptSources = extractScriptSources(htmlContent);
    console.log(`[A05 JS Import Check] Found ${scriptSources.length} script tags`);

    // Analyze each script
    const analyzedScripts: StepResult['scripts'] = [];
    const nonWhitelistedScripts: string[] = [];

    for (const src of scriptSources) {
      const isVanilla = isVanillaMendixScript(src);
      const matchedPattern = isVanilla ? null : matchesUserWhitelist(src, userWhitelist);
      const isUserWhitelisted = matchedPattern !== null;

      analyzedScripts.push({
        src,
        isVanilla,
        isUserWhitelisted,
        matchedPattern: matchedPattern || undefined,
      });

      if (!isVanilla && !isUserWhitelisted) {
        nonWhitelistedScripts.push(src);
      }
    }

    // Determine result
    const result: StepResult = {
      status: nonWhitelistedScripts.length === 0 ? 'pass' : 'fail',
      details: nonWhitelistedScripts.length === 0
        ? `All ${scriptSources.length} JavaScript imports are vanilla Mendix or whitelisted.`
        : `Found ${nonWhitelistedScripts.length} non-whitelisted JavaScript import(s): ${nonWhitelistedScripts.join(', ')}`,
      scripts: analyzedScripts,
      nonWhitelistedScripts,
    };

    console.log(`[A05 JS Import Check] Result: ${result.status} - ${result.details}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[A05 JS Import Check] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        details: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
