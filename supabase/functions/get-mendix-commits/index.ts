import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { credentialId, appId, branchName } = await req.json();

    if (!credentialId || !appId || !branchName) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's Mendix credentials
    const { data: credData, error: credError } = await supabase
      .from('mendix_credentials')
      .select('username, api_key, pat')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credError || !credData) {
      return new Response(JSON.stringify({ error: 'Credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the project ID for the app (appId parameter is actually project_id)
    const { data: appData, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id')
      .eq('project_id', appId)
      .eq('user_id', user.id)
      .single();

    if (appError || !appData?.project_id) {
      return new Response(JSON.stringify({ error: `Project not found for project_id: ${appId}. Error: ${appError?.message || 'No data returned'}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const projectId = appData.project_id;

    // Extract branch name from "branches/branch-name" format if needed
    let actualBranchName = branchName;
    if (actualBranchName.startsWith('branches/')) {
      actualBranchName = actualBranchName.substring('branches/'.length);
    }

    console.log(`Fetching commits for project ${projectId}, branch: ${actualBranchName}`);

    // Call Mendix Repository API to get commits
    const auth = `MxToken ${credData.pat}`;
    const repoApiUrl = `https://repository.api.mendix.com/v1/repositories/${projectId}/branches/${encodeURIComponent(actualBranchName)}/commits`;

    const response = await fetch(repoApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Mendix Repository API error: ${response.status} - ${errorText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch commits: ${response.status} ${response.statusText}`,
        details: errorText 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    
    // Sort commits by date (newest first) and return id and message
    const commits = (data.items || [])
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((commit: any) => ({
        id: commit.id,
        message: commit.message || 'No message'
      }));

    console.log(`Found ${commits.length} commits for branch ${actualBranchName}`);

    return new Response(JSON.stringify({ commits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-mendix-commits function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});