/**
 * AutoFixButton Component for GitLab Issues
 *
 * Stub component - implements the same pattern as GitHub's AutoFixButton
 * adapted for GitLab issues.
 */

import { useState, useEffect, useCallback } from 'react';
import { Wand2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Progress } from '../../ui/progress';
import type { GitLabIssue } from '../../../../shared/types';
import type { GitLabAutoFixConfig, GitLabAutoFixProgress, GitLabAutoFixQueueItem } from '../../../../shared/types';

interface GitLabAutoFixButtonProps {
  issue: GitLabIssue;
  projectId: string;
  config: GitLabAutoFixConfig | null;
  queueItem: GitLabAutoFixQueueItem | null;
  onStartAutoFix?: (projectId: string, issueIid: number) => void;
}

export function GitLabAutoFixButton({
  issue,
  projectId,
  config,
  queueItem,
  onStartAutoFix,
}: GitLabAutoFixButtonProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [progress, setProgress] = useState<GitLabAutoFixProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Check if the issue has an auto-fix label
  const hasAutoFixLabel = useCallback(() => {
    if (!config || !config.enabled || !config.labels.length) return false;
    const issueLabels = issue.labels.map(l => l.toLowerCase());
    return config.labels.some(label => issueLabels.includes(label.toLowerCase()));
  }, [config, issue.labels]);

  // Listen for progress events
  useEffect(() => {
    const cleanupProgress = window.electronAPI.onGitLabAutoFixProgress?.(
      (eventProjectId: string, progressData: GitLabAutoFixProgress) => {
        if (eventProjectId === projectId && progressData.issueIid === issue.iid) {
          setProgress(progressData);
          setIsStarting(false);
        }
      }
    );

    const cleanupComplete = window.electronAPI.onGitLabAutoFixComplete?.(
      (eventProjectId: string, result: GitLabAutoFixQueueItem) => {
        if (eventProjectId === projectId && result.issueIid === issue.iid) {
          setCompleted(true);
          setProgress(null);
          setIsStarting(false);
        }
      }
    );

    const cleanupError = window.electronAPI.onGitLabAutoFixError?.(
      (eventProjectId: string, errorData: { issueIid: number; error: string }) => {
        if (eventProjectId === projectId && errorData.issueIid === issue.iid) {
          setError(errorData.error);
          setProgress(null);
          setIsStarting(false);
        }
      }
    );

    return () => {
      cleanupProgress?.();
      cleanupComplete?.();
      cleanupError?.();
    };
  }, [projectId, issue.iid]);

  // Check if already in queue
  const isInQueue = queueItem && queueItem.status !== 'completed' && queueItem.status !== 'failed';
  const isProcessing = isStarting || progress !== null || isInQueue;

  const handleStartAutoFix = useCallback(() => {
    setIsStarting(true);
    setError(null);
    setCompleted(false);
    if (onStartAutoFix) {
      onStartAutoFix(projectId, issue.iid);
    } else if (window.electronAPI.startGitLabAutoFix) {
      window.electronAPI.startGitLabAutoFix(projectId, issue.iid);
    }
  }, [projectId, issue.iid, onStartAutoFix]);

  // Don't render if auto-fix is disabled or issue doesn't have the right label
  if (!config?.enabled) {
    return null;
  }

  // Show completed state
  if (completed || queueItem?.status === 'completed') {
    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <CheckCircle2 className="h-4 w-4" />
        <span>Spec created from issue</span>
      </div>
    );
  }

  // Show error state
  if (error || queueItem?.status === 'failed') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{error || queueItem?.error || 'Auto-fix failed'}</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleStartAutoFix}>
          <Wand2 className="h-4 w-4 mr-2" />
          Retry Auto Fix
        </Button>
      </div>
    );
  }

  // Show progress state
  if (isProcessing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{progress?.message || 'Processing...'}</span>
        </div>
        {progress && (
          <Progress value={progress.progress} className="h-1" />
        )}
      </div>
    );
  }

  // Show button - either highlighted if has auto-fix label, or normal
  return (
    <Button
      size="sm"
      variant={hasAutoFixLabel() ? 'default' : 'outline'}
      onClick={handleStartAutoFix}
    >
      <Wand2 className="h-4 w-4 mr-2" />
      Auto Fix
    </Button>
  );
}
