import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify the JWT from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = authData.user;
    const { credentialId, appId } = await req.json();

    if (!credentialId || !appId) {
      return new Response(JSON.stringify({ error: "Missing credentialId or appId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get Mendix credentials for this user and credentialId
    const { data: cred, error: credError } = await supabase
      .from("mendix_credentials")
      .select("id, user_id, username, api_key, pat")
      .eq("id", credentialId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (credError || !cred) {
      return new Response(JSON.stringify({ error: "Mendix credentials not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get project_id from app record for this user
    const { data: appRow, error: appError } = await supabase
      .from("mendix_apps")
      .select("project_id")
      .eq("app_id", appId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (appError || !appRow?.project_id) {
      return new Response(
        JSON.stringify({ error: `Project ID not found for app ${appId}. Try Fetch Apps first.` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const projectId = appRow.project_id as string;

    // Build request to Mendix App Repository API
    const url = `https://repository.api.mendix.com/v1/repositories/${projectId}/branches`;

    const headers: Record<string, string> = { Accept: "application/json" };

    if (cred.pat && String(cred.pat).trim().length > 0) {
      headers["Authorization"] = `MxToken ${cred.pat}`;
    } else {
      // PAT is recommended/required by the App Repository API
      return new Response(
        JSON.stringify({ error: "Personal Access Token (PAT) required on the selected credential to fetch branches." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Fetching branches for project ${projectId} as user ${user.id}`);
    const mxRes = await fetch(url, { headers, method: "GET" });

    if (!mxRes.ok) {
      const text = await mxRes.text();
      console.error("Mendix repo API error:", mxRes.status, text);
      return new Response(
        JSON.stringify({ error: `Mendix API returned ${mxRes.status}`, details: text }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const json = await mxRes.json();

    let branches: string[] = [];
    if (Array.isArray(json)) {
      branches = json
        .map((b: any) => b?.name || b?.Name || b?.branchName || b?.displayName || (typeof b === "string" ? b : null))
        .filter((v: any) => !!v);
    } else if (json?.items && Array.isArray(json.items)) {
      branches = json.items
        .map((b: any) => b?.name || b?.Name || b?.branchName || b?.displayName || (typeof b === "string" ? b : null))
        .filter((v: any) => !!v);
    }

    // Ensure unique and sorted
    branches = Array.from(new Set(branches)).sort((a, b) => a.localeCompare(b));

    return new Response(JSON.stringify({ branches }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("get-mendix-branches failed:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
