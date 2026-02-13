import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LintingResult {
  id: string;
  run_id: string;
  app_id: string;
  chapter: string;
  rule_name: string;
  rule_description: string | null;
  status: string;
  details: string | null;
  severity: string;
  checked_at: string;
}

export interface LintingRun {
  id: string;
  app_id: string;
  status: string;
  total_rules: number;
  passed_rules: number;
  failed_rules: number;
  started_at: string;
  completed_at: string | null;
}

export interface LintingChapterSummary {
  chapter: string;
  total: number;
  passed: number;
  failed: number;
  warnings: number;
}

export interface LintingData {
  run: LintingRun | null;
  results: LintingResult[];
  chapters: LintingChapterSummary[];
}

export function useLintingQuery(appId: string | null) {
  return useQuery<LintingData>({
    queryKey: ['linting', appId],
    queryFn: async () => {
      if (!appId) return { run: null, results: [], chapters: [] };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { run: null, results: [], chapters: [] };

      // Get latest completed run
      const { data: latestRun, error: runError } = await supabase
        .from('linting_runs')
        .select('*')
        .eq('app_id', appId)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runError) throw runError;
      if (!latestRun) return { run: null, results: [], chapters: [] };

      // Get results for this run
      const { data: results, error: resultsError } = await supabase
        .from('linting_results')
        .select('*')
        .eq('run_id', latestRun.id)
        .order('chapter', { ascending: true })
        .order('rule_name', { ascending: true });

      if (resultsError) throw resultsError;

      // Aggregate by chapter
      const chapterMap = new Map<string, LintingChapterSummary>();
      (results || []).forEach((r) => {
        if (!chapterMap.has(r.chapter)) {
          chapterMap.set(r.chapter, { chapter: r.chapter, total: 0, passed: 0, failed: 0, warnings: 0 });
        }
        const ch = chapterMap.get(r.chapter)!;
        ch.total++;
        if (r.status === 'pass') ch.passed++;
        else if (r.status === 'fail') ch.failed++;
        else if (r.status === 'warning') ch.warnings++;
      });

      return {
        run: latestRun as LintingRun,
        results: (results || []) as LintingResult[],
        chapters: Array.from(chapterMap.values()),
      };
    },
    enabled: !!appId,
    staleTime: 30_000,
  });
}
