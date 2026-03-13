import { CheckCircle2, Circle, XCircle, Loader2, AlertTriangle, GitMerge, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChecksStatus, ReviewsStatus, MergeableState } from '@shared/types/pr-status';
import { useTranslation } from 'react-i18next';

/**
 * CI Status Icon Component
 * Displays an icon representing the CI checks status
 */
interface CIStatusIconProps {
  status: ChecksStatus;
  className?: string;
}

function CIStatusIcon({ status, className }: CIStatusIconProps) {
  const baseClasses = 'h-4 w-4';

  switch (status) {
    case 'success':
      return <CheckCircle2 className={cn(baseClasses, 'text-emerald-400', className)} />;
    case 'pending':
      return <Loader2 className={cn(baseClasses, 'text-amber-400 animate-spin', className)} />;
    case 'failure':
      return <XCircle className={cn(baseClasses, 'text-red-400', className)} />;
    default:
      return <Circle className={cn(baseClasses, 'text-muted-foreground/50', className)} />;
  }
}

/**
 * Review Status Badge Component
 * Displays a badge representing the review status
 */
interface ReviewStatusBadgeProps {
  status: ReviewsStatus;
  className?: string;
}

function ReviewStatusBadge({ status, className }: ReviewStatusBadgeProps) {
  const { t } = useTranslation('common');

  switch (status) {
    case 'approved':
      return (
        <Badge variant="success" className={cn('gap-1', className)}>
          <CheckCircle2 className="h-3 w-3" />
          {t('prStatus.review.approved')}
        </Badge>
      );
    case 'changes_requested':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <AlertTriangle className="h-3 w-3" />
          {t('prStatus.review.changesRequested')}
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="warning" className={cn('gap-1', className)}>
          <Circle className="h-3 w-3" />
          {t('prStatus.review.pending')}
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * Merge Readiness Icon Component
 * Displays an icon representing the merge readiness state
 */
interface MergeReadinessIconProps {
  state: MergeableState;
  className?: string;
}

function MergeReadinessIcon({ state, className }: MergeReadinessIconProps) {
  const baseClasses = 'h-4 w-4';

  switch (state) {
    case 'clean':
      return <GitMerge className={cn(baseClasses, 'text-emerald-400', className)} />;
    case 'dirty':
      return <AlertTriangle className={cn(baseClasses, 'text-amber-400', className)} />;
    case 'blocked':
      return <HelpCircle className={cn(baseClasses, 'text-red-400', className)} />;
    default:
      return <HelpCircle className={cn(baseClasses, 'text-muted-foreground/50', className)} />;
  }
}

/**
 * StatusIndicator Props
 */
export interface MRStatusIndicatorProps {
  /** CI checks status */
  checksStatus?: ChecksStatus | null;
  /** Review status */
  reviewsStatus?: ReviewsStatus | null;
  /** Raw GitLab merge status string (e.g., 'can_be_merged', 'cannot_be_merged', 'checking') */
  mergeStatus?: string | null;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show a compact version (icons only) */
  compact?: boolean;
  /** Whether to show the merge readiness indicator */
  showMergeStatus?: boolean;
}

/**
 * StatusIndicator Component
 *
 * Displays CI status (success/pending/failure icons), review status
 * (approved/changes_requested/pending badges), and merge readiness
 * for GitLab MRs in the MR list view.
 *
 * Used alongside the existing MRStatusFlow dots component to provide
 * real-time MR status from GitLab's API polling.
 */
// Comprehensive merge status mapping for all GitLab detailed_merge_status values
const mergeKeyMap: Record<string, string> = {
  can_be_merged: 'ready',
  cannot_be_merged: 'conflict',
  checking: 'checking',
  // Additional GitLab merge status values
  policies: 'blocked',
  merge_when_pipeline_succeeds: 'merging',
  pipeline_failed: 'conflict',
  pipeline_success: 'ready',
  cant_be_merged: 'conflict',
  blocked: 'blocked',
  unchecked: 'checking',
  web_ide: 'checking',
  // Safe default for unknown statuses
};

// Map GitLab merge status to MergeableState for the icon
const gitlabToMergeableState: Record<string, MergeableState> = {
  can_be_merged: 'clean',
  cannot_be_merged: 'dirty',
  checking: 'blocked',
  // Additional GitLab merge status values
  policies: 'blocked',
  merge_when_pipeline_succeeds: 'clean',
  pipeline_failed: 'dirty',
  pipeline_success: 'clean',
  cant_be_merged: 'dirty',
  blocked: 'blocked',
  unchecked: 'blocked',
  web_ide: 'blocked',
  // Safe default
};

export function MRStatusIndicator({
  checksStatus,
  reviewsStatus,
  mergeStatus,
  className,
  compact = false,
  showMergeStatus = true,
}: MRStatusIndicatorProps) {
  const { t } = useTranslation('common');

  // Don't render if no status data is available
  if (!checksStatus && !reviewsStatus && !mergeStatus) {
    return null;
  }

  const mergeKey = mergeStatus ? mergeKeyMap[mergeStatus] : null;
  const mergeableState = mergeStatus ? gitlabToMergeableState[mergeStatus] : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* CI Status */}
      {checksStatus && checksStatus !== 'none' && (
        <div className="flex items-center gap-1" title={t(`mrStatus.ci.${checksStatus}`)}>
          <CIStatusIcon status={checksStatus} />
          {!compact && (
            <span className="text-xs text-muted-foreground">
              {t(`mrStatus.ci.${checksStatus}`)}
            </span>
          )}
        </div>
      )}

      {/* Review Status */}
      {reviewsStatus && reviewsStatus !== 'none' && (
        compact ? (
          <ReviewStatusBadge status={reviewsStatus} className="px-1.5 py-0" />
        ) : (
          <ReviewStatusBadge status={reviewsStatus} />
        )
      )}

      {/* Merge Readiness */}
      {showMergeStatus && mergeKey && mergeableState && (
        <div className="flex items-center gap-1" title={t(`mrStatus.merge.${mergeKey}`)}>
          <MergeReadinessIcon state={mergeableState} />
          {!compact && (
            <span className="text-xs text-muted-foreground">
              {t(`mrStatus.merge.${mergeKey}`)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact Status Indicator
 *
 * A minimal version showing just icons with tooltips.
 * Useful for tight spaces in the MR list.
 */
export function CompactMRStatusIndicator(props: Omit<MRStatusIndicatorProps, 'compact'>) {
  return <MRStatusIndicator {...props} compact />;
}

// Re-export sub-components for flexibility
export { CIStatusIcon, ReviewStatusBadge, MergeReadinessIcon };
