import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getErrorMessage } from '../_shared/error-utils.ts'
import { pingRailwayHealth } from '../_shared/railway-utils.ts'

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

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { credentialId, appId } = await req.json()
    if (!credentialId || !appId) {
      return new Response(JSON.stringify({ error: 'Missing credentialId or appId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const analyzerBaseUrl = Deno.env.get('MENDIX_ANALYZER_BASE_URL')
    const analyzerApiKey = Deno.env.get('MENDIX_ANALYZER_API_KEY')
    const webhookSecret = Deno.env.get('LINTING_WEBHOOK_SECRET')
    if (!analyzerBaseUrl || !analyzerApiKey) {
      return new Response(JSON.stringify({ error: 'Analyzer API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Fetch credential
    const { data: credential, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single()

    if (credError || !credential) {
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Look up app version to determine Git vs SVN
    const { data: appRow } = await supabase
      .from('mendix_apps')
      .select('version')
      .eq('project_id', appId)
      .eq('user_id', user.id)
      .single()

    function hasGitHash(ver?: string): boolean {
      if (!ver) return false
      return /[a-f0-9]{6,}$/i.test(ver)
    }

    const gitBased = hasGitHash(appRow?.version ?? undefined)

    // 3. Collect enabled rule IDs (global policies + per-app overrides)
    const { data: policies, error: polError } = await supabase
      .from('linting_policies')
      .select('id, rule_id, is_enabled')
      .eq('user_id', user.id)

    if (polError) throw polError

    const { data: overrides, error: ovrError } = await supabase
      .from('linting_policy_overrides')
      .select('policy_id, is_enabled')
      .eq('user_id', user.id)
      .eq('app_id', appId)

    if (ovrError) throw ovrError

    const overrideMap = new Map<string, boolean>()
    overrides?.forEach(o => overrideMap.set(o.policy_id, o.is_enabled))

    const enabledRuleIds: string[] = []
    policies?.forEach(p => {
      const isEnabled = overrideMap.has(p.id) ? overrideMap.get(p.id)! : p.is_enabled
      if (isEnabled) enabledRuleIds.push(p.rule_id)
    })

    if (enabledRuleIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No linting rules are enabled. Enable rules in Settings > Linting Rules.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Mark stale runs as failed (safety net for runs that never got a callback)
    await supabase
      .from('linting_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('app_id', appId)
      .eq('user_id', user.id)
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    console.log(`Running linting for app ${appId} with ${enabledRuleIds.length} rules`)

    // 4. Create linting_runs row
    const { data: run, error: runError } = await supabase
      .from('linting_runs')
      .insert({
        app_id: appId,
        user_id: user.id,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (runError || !run) {
      throw new Error(`Failed to create linting run: ${runError?.message}`)
    }

    // 5. Build webhook URL and send request to Analyzer API
    const webhookUrl = `${supabaseUrl}/functions/v1/linting-webhook?secret=${encodeURIComponent(webhookSecret)}&runId=${run.id}`
    const baseUrl = analyzerBaseUrl.replace(/\/$/, '')

    // Wake up Railway container before making the real request
    await pingRailwayHealth(baseUrl, analyzerApiKey)

    let accepted = false
    const useGitFirst = gitBased && !!credential.pat
    const useSvnOnly = !gitBased && appRow?.version // pure numeric version → SVN directly

    console.log(`App version: ${appRow?.version ?? 'unknown'}, git-based: ${gitBased}, strategy: ${useSvnOnly ? 'SVN-only' : useGitFirst ? 'Git-first' : 'fallback (try Git if PAT, else SVN)'}`)

    // Try Git first when version indicates git-based repo
    if (useGitFirst) {
      try {
        console.log('Trying Git endpoint with webhook...')
        const gitRes = await fetch(`${baseUrl}/analyze-mpr/git`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': analyzerApiKey,
          },
          body: JSON.stringify({
            projectId: appId,
            username: credential.username,
            pat: credential.pat,
            reportFormat: 'json',
            policies: enabledRuleIds,
            webhookUrl,
          }),
        })

        if (gitRes.ok) {
          accepted = true
          console.log('Git endpoint accepted request')
        } else {
          const errText = await gitRes.text()
          console.log(`Git endpoint failed (${gitRes.status}): ${errText}, falling back to SVN`)
        }
      } catch (e) {
        console.log(`Git endpoint error: ${getErrorMessage(e)}, falling back to SVN`)
      }
    } else if (!useSvnOnly && credential.pat) {
      // No version found → fall back to current behavior: try Git if PAT exists
      try {
        console.log('No version info, trying Git endpoint with webhook...')
        const gitRes = await fetch(`${baseUrl}/analyze-mpr/git`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': analyzerApiKey,
          },
          body: JSON.stringify({
            projectId: appId,
            username: credential.username,
            pat: credential.pat,
            reportFormat: 'json',
            policies: enabledRuleIds,
            webhookUrl,
          }),
        })

        if (gitRes.ok) {
          accepted = true
          console.log('Git endpoint accepted request')
        } else {
          const errText = await gitRes.text()
          console.log(`Git endpoint failed (${gitRes.status}): ${errText}, falling back to SVN`)
        }
      } catch (e) {
        console.log(`Git endpoint error: ${getErrorMessage(e)}, falling back to SVN`)
      }
    } else {
      console.log(useSvnOnly ? 'MX9 numeric version detected, skipping Git' : 'No PAT available, skipping Git endpoint')
    }

    // SVN fallback (or direct SVN for MX9 numeric versions)
    if (!accepted) {
      console.log('Using SVN endpoint with webhook...')
      const svnRes = await fetch(`${baseUrl}/analyze-mpr/svn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': analyzerApiKey,
        },
        body: JSON.stringify({
          projectId: appId,
          username: credential.username,
          password: credential.password || credential.api_key,
          reportFormat: 'json',
          policies: enabledRuleIds,
          webhookUrl,
        }),
      })

      if (svnRes.ok) {
        accepted = true
        console.log('SVN endpoint accepted request')
      } else {
        const errText = await svnRes.text()
        console.error(`SVN endpoint failed (${svnRes.status}): ${errText}`)

        await supabase
          .from('linting_runs')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('id', run.id)

        return new Response(JSON.stringify({ error: `Analyzer API error: ${errText}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      runId: run.id,
      status: 'started',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error running linting checks:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
