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

export function useCompetitionSchedule(): CompetitionScheduleState {
  const [schedule, setSchedule] = useState<CompetitionSchedule>(DEFAULT_COMPETITION_SCHEDULE);
  const [status, setStatus] = useState<CompetitionStatus>("VOTING_OPEN");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const data = await fetchCompetitionSchedule();
        if (!isMounted) return;
        setSchedule(data);
        setStatus(getCompetitionStatus(data, Date.now()));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();

    // Listen for realtime schedule changes from PostgreSQL
    const channel = supabase
      .channel("competition-schedule-status-hook")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_schedule" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const updated = payload.new as Record<string, unknown>;
            setSchedule((prev) => {
              const next: CompetitionSchedule = {
                ...prev,
                name: (updated.competition_name as string) || (updated.name as string) || prev.name,
                is_enabled:
                  updated.is_published !== undefined
                    ? Boolean(updated.is_published)
                    : updated.is_enabled !== undefined
                    ? Boolean(updated.is_enabled)
                    : prev.is_enabled,
                start_time: (updated.start_time as string) || prev.start_time,
                end_time: (updated.end_time as string) || prev.end_time,
                timezone: (updated.timezone as string) || prev.timezone,
                title: (updated.title as string) || prev.title,
                description: (updated.description as string | null) ?? prev.description,
              };
              setStatus(getCompetitionStatus(next, Date.now()));
              return next;
            });
          }
        }
      )
      .subscribe();

    // Re-check status every 10 seconds to detect deadline crossing in real time
    const interval = setInterval(() => {
      setStatus(getCompetitionStatus(schedule, Date.now()));
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [schedule]);

  return {
    schedule,
    status,
    isVotingClosed: status === "VOTING_CLOSED",
    isVotingOpen: status === "VOTING_OPEN",
    isUpcoming: status === "UPCOMING",
    loading,
  };
}

