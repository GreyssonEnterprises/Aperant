/**
 * MR Logs Component
 *
 * Displays detailed logs from GitLab merge request review operations.
 * Shows AI analysis phases, agent activities, and review progress.
 *
 * Stub component - implements the same pattern as PRLogs
 * adapted for GitLab merge requests.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Loader2,
  FolderOpen,
  BrainCircuit,
  FileCheck,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Clock,
  Activity
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type {
  PRLogs,
  PRLogPhase,
  PRPhaseLog,
  PRLogEntry
} from '@preload/api/modules/github-api';

// Type aliases for GitLab compatibility
type GitLabMRLogs = PRLogs;
type GitLabMRLogPhase = PRLogPhase;
type GitLabMRPhaseLog = PRPhaseLog;
type GitLabMRLogEntry = PRLogEntry;

interface MRLogsProps {
  mrIid: number;
  logs: GitLabMRLogs | null;
  isLoading: boolean;
  isStreaming?: boolean;
}

// Type guard to check if logs is the expected PRLogs structure or a plain string array
function isStructuredLogs(logs: unknown): logs is PRLogs {
  return (
    typeof logs === 'object' &&
    logs !== null &&
    'is_followup' in logs &&
    'updated_at' in logs &&
    'phases' in logs
  );
}

// TODO: The GITLAB_MR_GET_LOGS IPC handler returns string[] but this component expects PRLogs.
// Add a transformation to convert string[] to PRLogs structure in the handler or a data layer.
// For now, handle both formats defensively.

// Helper function to get phase labels with translation
function getPhaseLabel(phase: GitLabMRLogPhase, t: (key: string) => string): string {
  return t(`gitlab:mrReview.logs.${phase}Gathering`);
}

const PHASE_ICONS: Record<GitLabMRLogPhase, typeof FolderOpen> = {
  context: FolderOpen,
  analysis: BrainCircuit,
  synthesis: FileCheck
};

const PHASE_COLORS: Record<GitLabMRLogPhase, string> = {
  context: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  analysis: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  synthesis: 'text-green-500 bg-green-500/10 border-green-500/30'
};

// Source colors for different log sources
const SOURCE_COLORS: Record<string, string> = {
  'Context': 'bg-blue-500/20 text-blue-400',
  'AI': 'bg-purple-500/20 text-purple-400',
  'Orchestrator': 'bg-orange-500/20 text-orange-400',
  'ParallelOrchestrator': 'bg-orange-500/20 text-orange-400',
  'Followup': 'bg-cyan-500/20 text-cyan-400',
  'ParallelFollowup': 'bg-cyan-500/20 text-cyan-400',
  'BotDetector': 'bg-amber-500/20 text-amber-400',
  'Progress': 'bg-green-500/20 text-green-400',
  'MR Review Engine': 'bg-indigo-500/20 text-indigo-400',
  'Summary': 'bg-emerald-500/20 text-emerald-400',
  'Agent:logic-reviewer': 'bg-blue-600/20 text-blue-400',
  'Agent:quality-reviewer': 'bg-indigo-600/20 text-indigo-400',
  'Agent:security-reviewer': 'bg-red-600/20 text-red-400',
  'Agent:ai-triage-reviewer': 'bg-slate-500/20 text-slate-400',
  'Agent:resolution-verifier': 'bg-teal-600/20 text-teal-400',
  'Agent:new-code-reviewer': 'bg-cyan-600/20 text-cyan-400',
  'Agent:comment-analyzer': 'bg-gray-500/20 text-gray-400',
  'Specialist:security': 'bg-red-600/20 text-red-400',
  'Specialist:quality': 'bg-indigo-600/20 text-indigo-400',
  'Specialist:logic': 'bg-blue-600/20 text-blue-400',
  'Specialist:codebase-fit': 'bg-emerald-600/20 text-emerald-400',
  'FindingValidator': 'bg-amber-600/20 text-amber-400',
  'default': 'bg-muted text-muted-foreground'
};

// Helper type for grouped agent entries
interface AgentGroup {
  agentName: string;
  entries: GitLabMRLogEntry[];
}

// Patterns that indicate orchestrator tool activity (vs. important messages)
const TOOL_ACTIVITY_PATTERNS = [
  /^Reading /,
  /^Searching for /,
  /^Finding files /,
  /^Running: /,
  /^Editing /,
  /^Writing /,
  /^Using tool: /,
  /^Processing\.\.\. \(\d+ messages/,
  /^Tool result \[/,
];

function isToolActivityLog(content: string): boolean {
  return TOOL_ACTIVITY_PATTERNS.some(pattern => pattern.test(content));
}

// Group entries by: agents, orchestrator activity, and other entries
function groupEntriesByAgent(entries: GitLabMRLogEntry[]): {
  agentGroups: AgentGroup[];
  orchestratorActivity: GitLabMRLogEntry[];
  otherEntries: GitLabMRLogEntry[];
} {
  const agentMap = new Map<string, GitLabMRLogEntry[]>();
  const orchestratorActivity: GitLabMRLogEntry[] = [];
  const otherEntries: GitLabMRLogEntry[] = [];

  for (const entry of entries) {
    if (entry.source?.startsWith('Agent:') || entry.source?.startsWith('Specialist:')) {
      const existing = agentMap.get(entry.source) || [];
      existing.push(entry);
      agentMap.set(entry.source, existing);
    } else if (
      (entry.source === 'ParallelOrchestrator' || entry.source === 'ParallelFollowup') &&
      isToolActivityLog(entry.content)
    ) {
      orchestratorActivity.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  const agentGroups: AgentGroup[] = Array.from(agentMap.entries())
    .map(([agentName, agentEntries]) => ({ agentName, entries: agentEntries }))
    .sort((a, b) => {
      const aTime = a.entries[0]?.timestamp || '';
      const bTime = b.entries[0]?.timestamp || '';
      return aTime.localeCompare(bTime);
    });

  return { agentGroups, orchestratorActivity, otherEntries };
}

export function MRLogs({ mrIid, logs, isLoading, isStreaming = false }: MRLogsProps) {
  const { t } = useTranslation(['gitlab']);
  const [expandedPhases, setExpandedPhases] = useState<Set<GitLabMRLogPhase>>(new Set(['analysis']));
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Handle both structured PRLogs and plain string[] formats
  // TODO: Remove this fallback when GITLAB_MR_GET_LOGS returns structured PRLogs
  const isStructured = logs && isStructuredLogs(logs);
  const logsAsArray = Array.isArray(logs) ? logs : null;

  const togglePhase = (phase: GitLabMRLogPhase) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  const toggleAgent = (agentKey: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentKey)) {
        next.delete(agentKey);
      } else {
        next.add(agentKey);
      }
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
      <div className="p-4 space-y-2">
        {isLoading && !logs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logsAsArray ? (
          // Fallback for string[] format (current IPC handler return type)
          // TODO: Remove when GITLAB_MR_GET_LOGS returns structured PRLogs
          <>
            <div className="text-sm text-muted-foreground mb-4">
              {t('gitlab:mrReview.logs.mrLabel', { iid: mrIid })}
            </div>
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              {logsAsArray.map((log, idx) => (
                <div key={idx} className="py-0.5">{log}</div>
              ))}
            </div>
          </>
        ) : logs ? (
          <>
            {/* Logs header */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {t('gitlab:mrReview.logs.mrLabel', { iid: mrIid })}
                {logs.is_followup && <Badge variant="outline" className="text-xs">{t('gitlab:mrReview.logs.followup')}</Badge>}
                {isStreaming && (
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30 flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {t('gitlab:mrReview.logs.live')}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(logs.updated_at).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            {/* Phase-based collapsible logs */}
            {(['context', 'analysis', 'synthesis'] as GitLabMRLogPhase[]).map((phase) => (
              <PhaseLogSection
                key={phase}
                phase={phase}
                phaseLog={logs.phases[phase]}
                isExpanded={expandedPhases.has(phase)}
                onToggle={() => togglePhase(phase)}
                isStreaming={isStreaming}
                expandedAgents={expandedAgents}
                onToggleAgent={toggleAgent}
              />
            ))}
          </>
        ) : isStreaming ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-500" />
            <p>{t('gitlab:mrReview.logs.waitingForLogs')}</p>
            <p className="text-xs mt-1">{t('gitlab:mrReview.logs.reviewStarting')}</p>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Terminal className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>{t('gitlab:mrReview.logs.noLogsAvailable')}</p>
            <p className="text-xs mt-1">{t('gitlab:mrReview.logs.runReviewGenerateLogs')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Phase Log Section Component
interface PhaseLogSectionProps {
  phase: GitLabMRLogPhase;
  phaseLog: GitLabMRPhaseLog | null;
  isExpanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  expandedAgents: Set<string>;
  onToggleAgent: (agentKey: string) => void;
}

function PhaseLogSection({ phase, phaseLog, isExpanded, onToggle, isStreaming = false, expandedAgents, onToggleAgent }: PhaseLogSectionProps) {
  const { t } = useTranslation(['gitlab']);
  const Icon = PHASE_ICONS[phase];
  const status = phaseLog?.status || 'pending';
  const hasEntries = (phaseLog?.entries.length || 0) > 0;

  const getStatusBadge = () => {
    if (status === 'active' || (isStreaming && status === 'pending')) {
      return (
        <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {isStreaming ? t('gitlab:mrReview.logs.streaming') : t('gitlab:mrReview.logs.running')}
        </Badge>
      );
    }

    if (isStreaming && status === 'completed' && !hasEntries) {
      return (
        <Badge variant="secondary" className="text-xs text-muted-foreground">
          {t('gitlab:mrReview.logs.pending')}
        </Badge>
      );
    }

    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('gitlab:mrReview.logs.complete')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            {t('gitlab:mrReview.logs.failed')}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-xs text-muted-foreground">
            {t('gitlab:mrReview.logs.pending')}
          </Badge>
        );
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center justify-between p-3 rounded-lg border transition-colors',
            'hover:bg-secondary/50',
            status === 'active' && PHASE_COLORS[phase],
            status === 'completed' && 'border-success/30 bg-success/5',
            status === 'failed' && 'border-destructive/30 bg-destructive/5',
            status === 'pending' && 'border-border bg-secondary/30'
          )}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Icon className={cn('h-4 w-4', status === 'active' ? PHASE_COLORS[phase].split(' ')[0] : 'text-muted-foreground')} />
            <span className="font-medium text-sm">{getPhaseLabel(phase, t)}</span>
            {hasEntries && (
              <span className="text-xs text-muted-foreground">
                ({phaseLog?.entries.length} {t('gitlab:mrReview.logs.entries')})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-6 border-l-2 border-border pl-4 py-2 space-y-2">
          {!hasEntries ? (
            <p className="text-xs text-muted-foreground italic">{t('gitlab:mrReview.logs.noLogsYet')}</p>
          ) : (
            <GroupedLogEntries
              entries={phaseLog?.entries || []}
              phase={phase}
              expandedAgents={expandedAgents}
              onToggleAgent={onToggleAgent}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Grouped Log Entries Component
interface GroupedLogEntriesProps {
  entries: GitLabMRLogEntry[];
  phase: GitLabMRLogPhase;
  expandedAgents: Set<string>;
  onToggleAgent: (agentKey: string) => void;
}

function GroupedLogEntries({ entries, phase, expandedAgents, onToggleAgent }: GroupedLogEntriesProps) {
  const { agentGroups, orchestratorActivity, otherEntries } = groupEntriesByAgent(entries);

  return (
    <div className="space-y-2">
      {otherEntries.length > 0 && (
        <div className="space-y-1">
          {otherEntries.map((entry, idx) => (
            <LogEntry key={`other-${entry.timestamp}-${idx}`} entry={entry} />
          ))}
        </div>
      )}

      {orchestratorActivity.length > 0 && (
        <OrchestratorActivitySection
          entries={orchestratorActivity}
          phase={phase}
          isExpanded={expandedAgents.has(`${phase}-orchestrator-activity`)}
          onToggle={() => onToggleAgent(`${phase}-orchestrator-activity`)}
        />
      )}

      {agentGroups.map((group) => (
        <AgentLogGroup
          key={`${phase}-${group.agentName}`}
          group={group}
          phase={phase}
          isExpanded={expandedAgents.has(`${phase}-${group.agentName}`)}
          onToggle={() => onToggleAgent(`${phase}-${group.agentName}`)}
        />
      ))}
    </div>
  );
}

// Orchestrator Activity Section
interface OrchestratorActivitySectionProps {
  entries: GitLabMRLogEntry[];
  phase: GitLabMRLogPhase;
  isExpanded: boolean;
  onToggle: () => void;
}

function OrchestratorActivitySection({ entries, isExpanded, onToggle }: OrchestratorActivitySectionProps) {
  const { t } = useTranslation(['gitlab']);

  const readCount = entries.filter(e => e.content.startsWith('Reading ')).length;
  const searchCount = entries.filter(e => e.content.startsWith('Searching for ')).length;
  const otherCount = entries.length - readCount - searchCount;

  const summaryParts: string[] = [];
  if (readCount > 0) {
    summaryParts.push(t('gitlab:mrReview.logs.filesRead', { count: readCount }));
  }
  if (searchCount > 0) {
    summaryParts.push(t('gitlab:mrReview.logs.searches', { count: searchCount }));
  }
  if (otherCount > 0) {
    summaryParts.push(t('gitlab:mrReview.logs.other', { count: otherCount }));
  }
  const summary = summaryParts.join(', ') || t('gitlab:mrReview.logs.operations', { count: entries.length });

  return (
    <div className="rounded-md border border-border/50 bg-secondary/10 overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between p-2 transition-colors',
          'hover:bg-secondary/30',
          isExpanded && 'bg-secondary/20'
        )}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <Activity className="h-3 w-3 text-orange-400" />
          <span className="text-xs text-muted-foreground">{t('common:mrReview.logs.agentActivity')}</span>
        </div>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-500/10 text-orange-400 border-orange-500/30">
          {summary}
        </Badge>
      </button>

      {isExpanded && (
        <div className="border-t border-border/30 p-2 space-y-0.5 max-h-[300px] overflow-y-auto">
          {entries.map((entry, idx) => (
            <div key={`activity-${entry.timestamp}-${idx}`} className="flex items-start gap-2 text-[10px] text-muted-foreground/80 py-0.5">
              <span className="text-muted-foreground/50 tabular-nums shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="break-words">{entry.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Agent Log Group Component
interface AgentLogGroupProps {
  group: AgentGroup;
  phase: GitLabMRLogPhase;
  isExpanded: boolean;
  onToggle: () => void;
}

const SKIP_AS_SUMMARY_PATTERNS = [
  /^Starting analysis\.\.\.$/,
  /^Processing SDK stream\.\.\.$/,
  /^Processing\.\.\./,
  /^Awaiting response stream\.\.\.$/,
];

function isBoringSummary(content: string): boolean {
  return SKIP_AS_SUMMARY_PATTERNS.some(pattern => pattern.test(content));
}

function findSummaryEntry(entries: GitLabMRLogEntry[]): { summaryEntry: GitLabMRLogEntry | undefined; otherEntries: GitLabMRLogEntry[] } {
  if (entries.length === 0) return { summaryEntry: undefined, otherEntries: [] };

  const completeEntry = entries.find(e => e.content.startsWith('Complete:'));
  if (completeEntry) {
    return {
      summaryEntry: completeEntry,
      otherEntries: entries.filter(e => e !== completeEntry),
    };
  }

  const aiResponseEntry = entries.find(e => e.content.startsWith('AI response:'));
  if (aiResponseEntry) {
    return {
      summaryEntry: aiResponseEntry,
      otherEntries: entries.filter(e => e !== aiResponseEntry),
    };
  }

  const meaningfulEntry = entries.find(e => !isBoringSummary(e.content));
  if (meaningfulEntry) {
    return {
      summaryEntry: meaningfulEntry,
      otherEntries: entries.filter(e => e !== meaningfulEntry),
    };
  }

  return {
    summaryEntry: entries[0],
    otherEntries: entries.slice(1),
  };
}

function AgentLogGroup({ group, isExpanded, onToggle }: AgentLogGroupProps) {
  const { t } = useTranslation(['common']);
  const { agentName, entries } = group;
  const { summaryEntry, otherEntries } = findSummaryEntry(entries);
  const hasMoreEntries = otherEntries.length > 0;
  const displayName = agentName.replace('Agent:', '').replace('Specialist:', '');

  const getSourceColor = (source: string) => {
    return SOURCE_COLORS[source] || SOURCE_COLORS.default;
  };

  return (
    <div className="rounded-md border border-border/50 bg-secondary/20 overflow-hidden">
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0.5', getSourceColor(agentName))}
          >
            {displayName}
          </Badge>
          {hasMoreEntries && (
            <button
              onClick={onToggle}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                isExpanded && 'bg-secondary/50 text-foreground'
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>{t('common:mrReview.logs.hideMore', { count: otherEntries.length })}</span>
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span>{t('common:mrReview.logs.showMore', { count: otherEntries.length })}</span>
                </>
              )}
            </button>
          )}
        </div>

        {summaryEntry && (
          <LogEntry entry={{ ...summaryEntry, source: undefined }} />
        )}
      </div>

      {hasMoreEntries && isExpanded && (
        <div className="border-t border-border/30 bg-secondary/10 p-2 space-y-1">
          {otherEntries.map((entry, idx) => (
            <LogEntry key={`${entry.timestamp}-${idx}`} entry={{ ...entry, source: undefined }} />
          ))}
        </div>
      )}
    </div>
  );
}

// Log Entry Component
interface LogEntryProps {
  entry: GitLabMRLogEntry;
}

function LogEntry({ entry }: LogEntryProps) {
  const { t } = useTranslation(['gitlab']);
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetail = Boolean(entry.detail);

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const getSourceColor = (source: string | undefined) => {
    if (!source) return SOURCE_COLORS.default;
    return SOURCE_COLORS[source] || SOURCE_COLORS.default;
  };

  if (entry.type === 'error') {
    return (
      <div className="flex flex-col">
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1">
          <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-words flex-1">{entry.content}</span>
          {hasDetail && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
                'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
                isExpanded && 'bg-secondary/50'
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-2.5 w-2.5" />
                  <span>{t('gitlab:mrReview.logs.less')}</span>
                </>
              ) : (
                <>
                  <ChevronRight className="h-2.5 w-2.5" />
                  <span>{t('gitlab:mrReview.logs.more')}</span>
                </>
              )}
            </button>
          )}
        </div>
        {hasDetail && isExpanded && (
          <div className="mt-1.5 ml-4 p-2 bg-destructive/5 rounded-md border border-destructive/20 overflow-x-auto">
            <pre className="text-[10px] text-destructive/80 whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto">
              {entry.detail}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'success') {
    return (
      <div className="flex items-start gap-2 text-xs text-success bg-success/10 rounded-md px-2 py-1">
        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
        <span className="break-words flex-1">{entry.content}</span>
      </div>
    );
  }

  if (entry.type === 'info') {
    return (
      <div className="flex items-start gap-2 text-xs text-info bg-info/10 rounded-md px-2 py-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span className="break-words flex-1">{entry.content}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2 text-xs text-muted-foreground py-0.5">
        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        {entry.source && (
          <Badge variant="outline" className={cn('text-[9px] px-1 py-0 shrink-0', getSourceColor(entry.source))}>
            {entry.source}
          </Badge>
        )}
        <span className="break-words whitespace-pre-wrap flex-1">{entry.content}</span>
        {hasDetail && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
              'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
              isExpanded && 'bg-secondary/50'
            )}
          >
            {isExpanded ? (
              <>
                <ChevronDown className="h-2.5 w-2.5" />
                <span>{t('gitlab:mrReview.logs.less')}</span>
              </>
            ) : (
              <>
                <ChevronRight className="h-2.5 w-2.5" />
                <span>{t('gitlab:mrReview.logs.more')}</span>
              </>
            )}
          </button>
        )}
      </div>
      {hasDetail && isExpanded && (
        <div className="mt-1.5 ml-12 p-2 bg-secondary/30 rounded-md border border-border/50 overflow-x-auto">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto">
            {entry.detail}
          </pre>
        </div>
      )}
    </div>
  );
}
