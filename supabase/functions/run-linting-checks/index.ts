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
    console.log('[run-linting-checks] v2 - with version refresh')
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

    // 2. Look up app version and refresh if stale
    const { data: appRow } = await supabase
      .from('mendix_apps')
      .select('version')
      .eq('project_id', appId)
      .eq('user_id', user.id)
      .single()

    let appVersion = appRow?.version ?? undefined
    console.log(`[run-linting-checks] v3 - simplified routing. DB version: ${appVersion ?? 'null'}`)

    // Refresh version from Mendix API if it looks stale
    if (!appVersion || appVersion === '1.0.0') {
      try {
        const envHeaders: Record<string, string> = {}
        if (credential.pat) {
          envHeaders['Authorization'] = `MxToken ${credential.pat}`
        }
        const envRes = await fetch(
          `https://cloud.home.mendix.com/api/v4/apps/${appId}/environments`,
          { headers: envHeaders }
        )
        if (envRes.ok) {
          const envData = await envRes.json()
          const envs = envData.Environments || envData.environments || []
          const firstModel = envs.find((e: any) => e.modelVersion)?.modelVersion
          if (firstModel) {
            appVersion = firstModel
            await supabase
              .from('mendix_apps')
              .update({ version: firstModel })
              .eq('project_id', appId)
              .eq('user_id', user.id)
            console.log(`Refreshed app version to: ${firstModel}`)
          }
        } else {
          console.log(`Version refresh API returned ${envRes.status}`)
        }
      } catch (e) {
        console.log(`Version refresh failed: ${e}`)
      }
    }

    function getMajorVersion(ver?: string): number {
      if (!ver) return 0
      const match = ver.match(/^(\d+)\./)
      return match ? parseInt(match[1], 10) : 0
    }

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

    // Mark stale runs as failed
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

    // Simple routing: Mendix 9 = SVN, Mendix 10+ = GIT
    const majorVersion = getMajorVersion(appVersion)
    const useGit = majorVersion >= 10

    console.log(`App version: ${appVersion ?? 'unknown'}, major: ${majorVersion}, routing: ${useGit ? 'GIT' : 'SVN'}`)

    let accepted = false

    if (useGit) {
      if (!credential.pat) {
        await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
        return new Response(JSON.stringify({ error: 'Mendix 10+ requires a PAT. Add one in Settings > Credentials.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log('Using GIT endpoint...')
      const gitRes = await fetch(`${baseUrl}/analyze-mpr/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': analyzerApiKey },
        body: JSON.stringify({
          projectId: appId, username: credential.username, pat: credential.pat,
          reportFormat: 'json', policies: enabledRuleIds, webhookUrl,
        }),
      })
      if (gitRes.ok) {
        accepted = true
      } else {
        const errText = await gitRes.text()
        console.error(`GIT endpoint failed (${gitRes.status}): ${errText}`)
        await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
        return new Response(JSON.stringify({ error: `Analyzer error: ${errText}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      console.log('Using SVN endpoint...')
      const svnRes = await fetch(`${baseUrl}/analyze-mpr/svn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': analyzerApiKey },
        body: JSON.stringify({
          projectId: appId, username: credential.username,
          password: credential.password || credential.api_key,
          reportFormat: 'json', policies: enabledRuleIds, webhookUrl,
        }),
      })
      if (svnRes.ok) {
        accepted = true
      } else {
        const errText = await svnRes.text()
        console.error(`SVN endpoint failed (${svnRes.status}): ${errText}`)
        await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
        return new Response(JSON.stringify({ error: `Analyzer error: ${errText}` }), {
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
