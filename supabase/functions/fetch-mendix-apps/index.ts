import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentialId } = await req.json();
    if (!credentialId) {
      return new Response(JSON.stringify({ error: 'Credential ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch the credential details - ensure it belongs to the authenticated user
    const { data: credential, error: credentialError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credentialError || !credential) {
      console.error('Credential fetch error:', credentialError);
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Making API call for credential: ${credential.username}`);

    // Make the API call to Mendix using both API key and PAT if available
    const headers: Record<string, string> = {
      'Mendix-Username': credential.username,
    };

    if (credential.api_key) {
      headers['Mendix-ApiKey'] = credential.api_key;
    }

    if (credential.pat) {
      headers['Authorization'] = `MxToken ${credential.pat}`;
    }

    const mendixResponse = await fetch('https://deploy.mendix.com/api/1/apps', {
      method: 'GET',
      headers
    });

    if (!mendixResponse.ok) {
      console.error(`Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`);
      return new Response(JSON.stringify({
        error: `Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`
      }), {
        status: mendixResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apps = await mendixResponse.json();
    console.log(`Successfully fetched ${apps.length} apps from Mendix`);

    // Clear previous results for this credential
    const { error: deleteError } = await supabase
      .from('mendix_apps')
      .delete()
      .eq('credential_id', credentialId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting previous results:', deleteError);
    }

    // Store the new results
    if (apps.length > 0) {
      const appResults = apps.map((app: any) => ({
        user_id: user.id,
        credential_id: credentialId,
        app_name: app.Name,
        app_url: app.Url,
        project_id: app.ProjectId,
        app_id: app.AppId,
        status: 'healthy', // Default status, could be enhanced with actual health checks
        environment: 'production', // Default environment, could be determined from app data
        version: '1.0.0', // Default version, could be enhanced with actual version info
        active_users: Math.floor(Math.random() * 100), // Mock data for now
        error_count: Math.floor(Math.random() * 5), // Mock data for now
        last_deployed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() // Random date within last 30 days
      }));

      const { error: insertError } = await supabase
        .from('mendix_apps')
        .insert(appResults);

      if (insertError) {
        console.error('Error storing app results:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to store app results' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      apps,
      message: `Successfully fetched and stored ${apps.length} apps`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in fetch-mendix-apps function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});