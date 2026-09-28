import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest } from '@/lib/queryClient';

interface UseProgressTrackingProps {
  assignmentId: string;
  enabled?: boolean;
}

export function useProgressTracking({ assignmentId, enabled = true }: UseProgressTrackingProps) {
  const { user } = useAuth();

  // Always call hooks unconditionally - just disable their effects
  const shouldTrack = enabled && !!user && !!assignmentId;
  const sessionStartTime = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef<boolean>(false);

  // Initialize progress tracking on mount
  useEffect(() => {
    if (!shouldTrack) return;

    const initProgress = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          console.error('[Progress] No auth token found');
          throw new Error('Not authenticated - please log in again');
        }

        console.log('[Progress] Initializing progress for assignment:', assignmentId);

        const response = await fetch('/api/progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            assignmentId,
            studentId: user.id, // Assuming user.id is available here
            status: 'not_started',
            timeSpent: 0,
            messages: 0,
          }),
        });

        console.log('[Progress] Init response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[Progress] Init failed:', errorData);
          throw new Error(errorData.error || `Failed to initialize progress (${response.status})`);
        }

        // If initialization is successful, proceed to the original logic
        return true;
      } catch (error) {
        console.error('Failed to initialize progress:', error);
        return false;
      }
    };

    initProgress().then((shouldTrack) => {
      // Only start time tracking if not completed
      if (!shouldTrack || isCompletedRef.current) {
        return;
      }

      sessionStartTime.current = Date.now();

      // Update time spent every 30 seconds
      timerRef.current = setInterval(async () => {
        if (isCompletedRef.current) {
          clearInterval(timerRef.current!);
          return;
        }

        const timeSpent = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        try {
          await apiRequest('PATCH', `/api/progress/${assignmentId}/${user.id}/time`, {
            timeSpent,
          });
        } catch (error) {
          console.error('Failed to update time spent:', error);
        }
      }, 30000); // Every 30 seconds
    });

    // Cleanup on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Only update final time if not completed
      if (!isCompletedRef.current && sessionStartTime.current) {
        const finalTimeSpent = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        apiRequest('PATCH', `/api/progress/${assignmentId}/${user.id}/time`, {
          timeSpent: finalTimeSpent,
        }).catch((error) => {
          console.error('Failed to update final time spent:', error);
        });
      }
    };
  }, [assignmentId, user?.id, shouldTrack]);

  // Track message sent (skip if completed)
  const trackMessageSent = async () => {
    console.log('[Track Message] Called - shouldTrack:', shouldTrack, 'isCompleted:', isCompletedRef.current, 'assignmentId:', assignmentId, 'userId:', user?.id);

    if (!shouldTrack || isCompletedRef.current) {
      console.log('[Track Message] Skipping - shouldTrack:', shouldTrack, 'isCompleted:', isCompletedRef.current);
      return;
    }

    try {
      console.log('[Track Message] Sending increment request to:', `/api/progress/${assignmentId}/${user.id}/increment`);
      await apiRequest('POST', `/api/progress/${assignmentId}/${user.id}/increment`, {});
      console.log('[Track Message] ✓ Message tracked successfully');
    } catch (error) {
      console.error('[Track Message] ❌ Failed to track message:', error);
    }
  };

  // Update status (for changing from not_started to in_progress)
  const updateStatus = async (status: string) => {
    if (!user || !assignmentId || isCompletedRef.current) return;

    try {
      await apiRequest('PATCH', `/api/progress/${assignmentId}/${user.id}/status`, {
        status,
      });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  // Mark as complete
  const markComplete = async () => {
    if (!user || !assignmentId) return;

    try {
      // Mark status as completed first
      await apiRequest('PATCH', `/api/progress/${assignmentId}/${user.id}/status`, {
        status: 'completed',
      });

      // Immediately stop all tracking (even if time update fails)
      isCompletedRef.current = true;

      // Clear the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Update final time spent (non-critical, so don't throw if it fails)
      try {
        const finalTimeSpent = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        await apiRequest('PATCH', `/api/progress/${assignmentId}/${user.id}/time`, {
          timeSpent: finalTimeSpent,
        });
      } catch (timeError) {
        console.error('Failed to update final time (non-critical):', timeError);
        // Don't throw - completion status is already saved
      }
    } catch (error) {
      console.error('Failed to mark complete:', error);
      throw error;
    }
  };

  // Create or update progress (exported for manual initialization)
  const createOrUpdateProgress = async (data: any) => {
    if (!user || !assignmentId) return;

    try {
      await apiRequest('POST', '/api/progress', data);
    } catch (error) {
      console.error('Failed to create/update progress:', error);
    }
  };

  return {
    trackMessageSent,
    markComplete,
    updateStatus,
    createOrUpdateProgress,
  };
}