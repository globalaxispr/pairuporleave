import { useState, useEffect } from "react";
import {
  fetchCompetitionSchedule,
  getCompetitionStatus,
  supabase,
  type CompetitionSchedule,
  type CompetitionStatus,
  DEFAULT_COMPETITION_SCHEDULE,
} from "@/lib/supabase";

export interface CompetitionScheduleState {
  schedule: CompetitionSchedule;
  status: CompetitionStatus;
  isVotingClosed: boolean;
  isVotingOpen: boolean;
  isUpcoming: boolean;
  loading: boolean;
}

// Module-level singleton state to prevent duplicate Realtime channel subscriptions
let sharedSchedule: CompetitionSchedule = DEFAULT_COMPETITION_SCHEDULE;
let sharedStatus: CompetitionStatus = "VOTING_OPEN";
let sharedLoading = true;
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let subscribersCount = 0;
const listeners = new Set<() => void>();
let initialFetchPromise: Promise<void> | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

async function ensureScheduleLoaded() {
  if (!initialFetchPromise) {
    initialFetchPromise = fetchCompetitionSchedule()
      .then((data) => {
        sharedSchedule = data;
        sharedStatus = getCompetitionStatus(data, Date.now());
      })
      .catch((err) => {
        console.warn("[useCompetitionSchedule] Schedule fetch failed, using fallback:", err);
      })
      .finally(() => {
        sharedLoading = false;
        notifyListeners();
      });
  }
  return initialFetchPromise;
}

function startRealtimeSubscription() {
  if (sharedChannel) return;

  try {
    sharedChannel = supabase
      .channel("competition-schedule-status-singleton")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_schedule" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const updated = payload.new as Record<string, unknown>;
            sharedSchedule = {
              ...sharedSchedule,
              name: (updated.competition_name as string) || (updated.name as string) || sharedSchedule.name,
              is_enabled:
                updated.is_published !== undefined
                  ? Boolean(updated.is_published)
                  : updated.is_enabled !== undefined
                  ? Boolean(updated.is_enabled)
                  : sharedSchedule.is_enabled,
              start_time: (updated.start_time as string) || sharedSchedule.start_time,
              end_time: (updated.end_time as string) || sharedSchedule.end_time,
              timezone: (updated.timezone as string) || sharedSchedule.timezone,
              title: (updated.title as string) || sharedSchedule.title,
              description: (updated.description as string | null) ?? sharedSchedule.description,
            };
            sharedStatus = getCompetitionStatus(sharedSchedule, Date.now());
            notifyListeners();
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[useCompetitionSchedule] Realtime channel error, polling fallback remains active");
        }
      });
  } catch (err) {
    console.warn("[useCompetitionSchedule] Could not start realtime subscription:", err);
  }

  if (!intervalId) {
    intervalId = setInterval(() => {
      const nextStatus = getCompetitionStatus(sharedSchedule, Date.now());
      if (nextStatus !== sharedStatus) {
        sharedStatus = nextStatus;
        notifyListeners();
      }
    }, 10000);
  }
}

function stopRealtimeSubscription() {
  if (subscribersCount <= 0) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (sharedChannel) {
      try {
        void supabase.removeChannel(sharedChannel);
      } catch (err) {
        // ignore
      }
      sharedChannel = null;
    }
  }
}

export function useCompetitionSchedule(): CompetitionScheduleState {
  const [, setTick] = useState(0);

  useEffect(() => {
    subscribersCount++;
    const update = () => setTick((t) => t + 1);
    listeners.add(update);

    void ensureScheduleLoaded();
    startRealtimeSubscription();

    return () => {
      listeners.delete(update);
      subscribersCount--;
      if (subscribersCount <= 0) {
        stopRealtimeSubscription();
      }
    };
  }, []);

  return {
    schedule: sharedSchedule,
    status: sharedStatus,
    isVotingClosed: sharedStatus === "VOTING_CLOSED",
    isVotingOpen: sharedStatus === "VOTING_OPEN",
    isUpcoming: sharedStatus === "UPCOMING",
    loading: sharedLoading,
  };
}
