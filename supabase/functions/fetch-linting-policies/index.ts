import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getErrorMessage } from '../_shared/error-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const analyzerBaseUrl = Deno.env.get('MENDIX_ANALYZER_BASE_URL')
    const analyzerApiKey = Deno.env.get('MENDIX_ANALYZER_API_KEY')

    if (!analyzerBaseUrl || !analyzerApiKey) {
      return new Response(JSON.stringify({ error: 'Analyzer API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Call the Analyzer /policies endpoint
    const policiesUrl = `${analyzerBaseUrl.replace(/\/$/, '')}/policies`
    console.log(`Fetching policies from: ${policiesUrl}`)

    const response = await fetch(policiesUrl, {
      method: 'GET',
      headers: { 'X-API-Key': analyzerApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Analyzer API error: ${response.status} - ${errorText}`)
      return new Response(JSON.stringify({ error: `Analyzer API returned ${response.status}`, details: errorText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const policiesData = await response.json()
    console.log(`Received policies data with ${Object.keys(policiesData).length} categories`)

    // Parse the response: { "category_name": [{ id, title, description, severity }, ...], ... }
    const rows: Array<{
      user_id: string
      rule_id: string
      category: string
      title: string
      description: string | null
      severity: string | null
      is_enabled: boolean
    }> = []

    for (const [category, rules] of Object.entries(policiesData)) {
      if (!Array.isArray(rules)) continue
      for (const rule of rules as Array<{ id: string; title: string; description?: string; severity?: string }>) {
        rows.push({
          user_id: user.id,
          rule_id: rule.id,
          category,
          title: rule.title,
          description: rule.description || null,
          severity: rule.severity || null,
          is_enabled: true,
        })
      }
    }

    console.log(`Parsed ${rows.length} total rules`)

    if (rows.length > 0) {
      // Upsert rules - new rules default to enabled, existing rules keep their is_enabled state
      const { error: upsertError } = await supabase
        .from('linting_policies')
        .upsert(rows, {
          onConflict: 'user_id,rule_id',
          ignoreDuplicates: false,
        })
        // Only update metadata fields, NOT is_enabled (preserve user's toggle choice)
        // Supabase upsert will update all columns on conflict, so we need a different approach

      if (upsertError) {
        console.error('Upsert error:', upsertError)
        // Try individual upserts to preserve is_enabled for existing rows
        for (const row of rows) {
          // Check if rule exists
          const { data: existing } = await supabase
            .from('linting_policies')
            .select('id')
            .eq('user_id', user.id)
            .eq('rule_id', row.rule_id)
            .maybeSingle()

          if (existing) {
            // Update metadata only
            await supabase
              .from('linting_policies')
              .update({ category: row.category, title: row.title, description: row.description, severity: row.severity })
              .eq('id', existing.id)
          } else {
            // Insert new rule
            await supabase.from('linting_policies').insert(row)
          }
        }
      }
    }

    // Fetch all policies for this user
    const { data: allPolicies, error: fetchError } = await supabase
      .from('linting_policies')
      .select('*')
      .eq('user_id', user.id)
      .order('category')
      .order('rule_id')

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ policies: allPolicies, fetched: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
