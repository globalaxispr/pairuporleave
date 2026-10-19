import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import {
  Calendar,
  Clock,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  Eye,
  Sliders,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  fetchCompetitionSchedule,
  updateCompetitionSchedule,
  getCompetitionStatus,
  type CompetitionSchedule,
  type CompetitionStatus,
  DEFAULT_COMPETITION_SCHEDULE,
} from "@/lib/supabase";

const TIMEZONE_OPTIONS = [
  { label: "Eastern Time — US (New York, EDT/EST)", value: "America/New_York" },
  { label: "Central Time — US (Chicago, CDT/CST)", value: "America/Chicago" },
  { label: "Mountain Time — US (Denver, MDT/MST)", value: "America/Denver" },
  { label: "Pacific Time — US (Los Angeles, PDT/PST)", value: "America/Los_Angeles" },
  { label: "Coordinated Universal Time (UTC)", value: "UTC" },
  { label: "Brasília Time — BR (São Paulo, BRT)", value: "America/Sao_Paulo" },
  { label: "British Summer Time / GMT (London)", value: "Europe/London" },
  { label: "Central European Time (Paris/Berlin)", value: "Europe/Paris" },
];

export function AdminSchedulePage() {
  const [schedule, setSchedule] = useState<CompetitionSchedule>(DEFAULT_COMPETITION_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCompetitionSchedule();
        setSchedule(data);
        setName(data.name);
        setIsEnabled(data.is_enabled);
        setStartTime(
          data.start_time ? new Date(data.start_time).toISOString().slice(0, 16) : ""
        );
        setEndTime(
          data.end_time ? new Date(data.end_time).toISOString().slice(0, 16) : ""
        );
        setTimezone(data.timezone || "America/New_York");
        setTitle(data.title);
        setDescription(data.description || "");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!name.trim()) {
      setMessage({ type: "error", text: "Competition name is required." });
      return;
    }

    if (!startTime || !endTime) {
      setMessage({ type: "error", text: "Both start time and end time are required." });
      return;
    }

    const startUtc = new Date(startTime).getTime();
    const endUtc = new Date(endTime).getTime();

    if (isNaN(startUtc) || isNaN(endUtc)) {
      setMessage({ type: "error", text: "Invalid date format." });
      return;
    }

    if (endUtc <= startUtc) {
      setMessage({
        type: "error",
        text: "End time must be after start time. Please correct the schedule dates.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<CompetitionSchedule> = {
        name: name.trim(),
        is_enabled: isEnabled,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        timezone,
        title: title.trim() || DEFAULT_COMPETITION_SCHEDULE.title,
        description: description.trim() || null,
      };

      const res = await updateCompetitionSchedule(payload);
      if (res.success) {
        setSchedule((prev) => ({ ...prev, ...payload }));
        setMessage({
          type: "success",
          text: res.error
            ? res.error
            : "Competition schedule updated successfully! Public countdown is synchronized.",
        });
      } else {
        setMessage({
          type: "error",
          text: res.error || "Failed to update competition schedule.",
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message || "An unexpected error occurred while saving.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Preview status calculation
  const previewSchedule: CompetitionSchedule = {
    ...schedule,
    name: name || schedule.name,
    is_enabled: isEnabled,
    start_time: startTime ? new Date(startTime).toISOString() : schedule.start_time,
    end_time: endTime ? new Date(endTime).toISOString() : schedule.end_time,
    timezone,
    title: title || schedule.title,
    description: description || schedule.description,
  };

  const previewStatus: CompetitionStatus = getCompetitionStatus(previewSchedule);

  const formatZoned = (isoDate: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(isoDate));
    } catch {
      return isoDate;
    }
  };

  return (
    <AdminLayout>
      <Helmet>
        <title>Competition Schedule — Pair Up or Leave Admin</title>
      </Helmet>

      <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: "3rem" }}>
        {/* Top Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>Admin</span>
              <span style={{ color: "#F0DCE2" }}>/</span>
              <span style={{ fontSize: "0.8125rem", color: "#7A0C2E", fontWeight: 700 }}>Competition Schedule</span>
            </div>
            <h1
              style={{
                fontSize: "1.875rem",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <Calendar size={30} color="#E51B3E" />
              <span>Competition Schedule & Voting Window</span>
            </h1>
            <p style={{ color: "#6B6870", margin: "0.375rem 0 0", fontSize: "0.9375rem" }}>
              Configure active competition voting dates, canonical UTC deadlines, public countdown timers, and server-side voting cutoff rules.
            </p>
          </div>

          {/* Current Status Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.5rem 1rem",
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #F0DCE2",
              boxShadow: "0 2px 8px rgba(74, 6, 28, 0.04)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>Voting Window:</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.25rem 0.625rem",
                borderRadius: 9999,
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background:
                  previewStatus === "VOTING_OPEN"
                    ? "rgba(34, 197, 94, 0.12)"
                    : previewStatus === "UPCOMING"
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(107, 104, 112, 0.12)",
                color:
                  previewStatus === "VOTING_OPEN"
                    ? "#15803D"
                    : previewStatus === "UPCOMING"
                    ? "#B45309"
                    : "#6B6870",
              }}
            >
              {previewStatus === "VOTING_OPEN" && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
              )}
              {previewStatus === "VOTING_OPEN"
                ? "VOTING OPEN"
                : previewStatus === "UPCOMING"
                ? "UPCOMING"
                : "VOTING CLOSED"}
            </span>
          </div>
        </div>

        {/* Feedback Banner */}
        {message && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: 12,
              marginBottom: "1.75rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              background:
                message.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${
                message.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"
              }`,
              color: message.type === "success" ? "#15803D" : "#B91C1C",
              fontSize: "0.875rem",
            }}
          >
            {message.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <div>{message.text}</div>
          </div>
        )}

        {/* 2-Column: Form (Left) & Realtime Preview (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <div className="lg:col-span-7">
            <form
              onSubmit={handleSave}
              style={{
                background: "#FFFFFF",
                border: "1px solid #F0DCE2",
                borderRadius: 20,
                padding: "2rem",
                boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.75rem",
              }}
            >
              {/* 1. Schedule Enabled / Published Switch */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  borderRadius: 14,
                  background: isEnabled ? "#FFF8FA" : "#F9F9FB",
                  border: "1px solid #F0DCE2",
                }}
              >
                <div>
                  <label
                    htmlFor="schedule-enabled"
                    style={{
                      display: "block",
                      fontSize: "0.9375rem",
                      fontWeight: 800,
                      color: "#24131A",
                      cursor: "pointer",
                    }}
                  >
                    Enable Competition Schedule & Homepage Countdown
                  </label>
                  <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.25rem 0 0" }}>
                    When disabled, the public countdown is hidden and voting is temporarily paused.
                  </p>
                </div>
                <input
                  id="schedule-enabled"
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  style={{ width: 22, height: 22, accentColor: "#E51B3E", cursor: "pointer" }}
                />
              </div>

              {/* 2. Competition Name */}
              <div>
                <label
                  htmlFor="comp-name"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Competition Name
                </label>
                <input
                  id="comp-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="PAIR UP OR LEAVE — Official Season Voting"
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    border: "1.5px solid #F0DCE2",
                    fontSize: "0.9375rem",
                    color: "#24131A",
                  }}
                />
              </div>

              {/* 3. Timezone Selector */}
              <div>
                <label
                  htmlFor="comp-tz"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Competition Display Timezone
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    id="comp-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      border: "1.5px solid #F0DCE2",
                      fontSize: "0.9375rem",
                      color: "#24131A",
                      background: "#FFFFFF",
                      cursor: "pointer",
                    }}
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#6B6870", margin: "0.375rem 0 0" }}>
                  Dates are canonicalized in UTC on the server and displayed to users localized to this timezone.
                </p>
              </div>

              {/* 4. Start & End Datetime Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="start-time"
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      color: "#24131A",
                      marginBottom: "0.5rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Voting Start Date & Time
                  </label>
                  <input
                    id="start-time"
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      border: "1.5px solid #F0DCE2",
                      fontSize: "0.9375rem",
                      color: "#24131A",
                    }}
                  />
                  {startTime && (
                    <div style={{ fontSize: "0.75rem", color: "#7A0C2E", marginTop: 4, fontWeight: 600 }}>
                      Local: {formatZoned(startTime)}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="end-time"
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      color: "#24131A",
                      marginBottom: "0.5rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Voting End Date & Time (Deadline)
                  </label>
                  <input
                    id="end-time"
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      border: "1.5px solid #F0DCE2",
                      fontSize: "0.9375rem",
                      color: "#24131A",
                    }}
                  />
                  {endTime && (
                    <div style={{ fontSize: "0.75rem", color: "#E51B3E", marginTop: 4, fontWeight: 600 }}>
                      Deadline: {formatZoned(endTime)}
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Countdown Title & Description */}
              <div>
                <label
                  htmlFor="countdown-title"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Public Countdown Title
                </label>
                <input
                  id="countdown-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Voting Closes In"
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    border: "1.5px solid #F0DCE2",
                    fontSize: "0.9375rem",
                    color: "#24131A",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="countdown-desc"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Public Description (Optional)
                </label>
                <textarea
                  id="countdown-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Every vote counts towards the live rankings. Support your favorite couples and individual candidates before the deadline!"
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    border: "1.5px solid #F0DCE2",
                    fontSize: "0.9375rem",
                    color: "#24131A",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Submit / Reset Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  borderTop: "1px solid #F0DCE2",
                  paddingTop: "1.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setName(schedule.name);
                    setIsEnabled(schedule.is_enabled);
                    setStartTime(
                      schedule.start_time
                        ? new Date(schedule.start_time).toISOString().slice(0, 16)
                        : ""
                    );
                    setEndTime(
                      schedule.end_time
                        ? new Date(schedule.end_time).toISOString().slice(0, 16)
                        : ""
                    );
                    setTimezone(schedule.timezone || "America/New_York");
                    setTitle(schedule.title);
                    setDescription(schedule.description || "");
                    setMessage(null);
                  }}
                  style={{
                    padding: "0.85rem 1.25rem",
                    borderRadius: 12,
                    background: "#F9F9FB",
                    border: "1px solid #F0DCE2",
                    color: "#6B6870",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.85rem 1.75rem",
                    borderRadius: 12,
                    background: "#E51B3E",
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: "0.9375rem",
                    border: "none",
                    cursor: saving ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 10px rgba(229, 27, 62, 0.35)",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Saving Schedule...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Save Competition Schedule</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Countdown Preview */}
          <div className="lg:col-span-5">
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #F0DCE2",
                borderRadius: 20,
                padding: "1.5rem",
                boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
                position: "sticky",
                top: "2rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Eye size={18} color="#7A0C2E" />
                  <span style={{ fontWeight: 800, fontSize: "0.9375rem", color: "#24131A" }}>
                    Public Countdown Preview
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.5rem",
                    borderRadius: 6,
                    background: isEnabled ? "#DCFCE7" : "#FEE2E2",
                    color: isEnabled ? "#15803D" : "#B91C1C",
                  }}
                >
                  {isEnabled ? "Visible on Homepage" : "Hidden from Homepage"}
                </span>
              </div>

              {/* Mock Homepage Preview Box */}
              <div
                style={{
                  background: "#4A061C",
                  borderRadius: 18,
                  padding: "1.5rem",
                  color: "#FFFFFF",
                  boxShadow: "0 10px 25px rgba(74, 6, 28, 0.25)",
                  border: "1px solid rgba(240, 220, 226, 0.25)",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.6875rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: previewStatus === "VOTING_OPEN" ? "#FF5475" : "#FFE1E8",
                      background: "rgba(255, 255, 255, 0.1)",
                      padding: "0.2rem 0.6rem",
                      borderRadius: 999,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {previewStatus === "VOTING_OPEN"
                      ? "● VOTING OPEN NOW"
                      : previewStatus === "UPCOMING"
                      ? "UPCOMING ROUND"
                      : "VOTING CLOSED"}
                  </span>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#FFFFFF" }}>
                    {title || "Voting Closes In"}
                  </div>
                </div>

                {/* 4 Unit Preview */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "0.5rem",
                    textAlign: "center",
                    marginBottom: "1rem",
                  }}
                >
                  {["DAYS", "HOURS", "MIN", "SEC"].map((u, i) => (
                    <div
                      key={u}
                      style={{
                        background: "rgba(26, 2, 9, 0.7)",
                        padding: "0.6rem 0.25rem",
                        borderRadius: 10,
                        border: "1px solid rgba(255, 225, 232, 0.15)",
                      }}
                    >
                      <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#FFFFFF", fontVariantNumeric: "tabular-nums" }}>
                        {i === 0 ? "13" : i === 1 ? "23" : i === 2 ? "59" : "45"}
                      </div>
                      <div style={{ fontSize: "0.625rem", fontWeight: 700, color: "#FF5475" }}>{u}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#FFE1E8",
                    textAlign: "center",
                    borderTop: "1px solid rgba(255, 225, 232, 0.15)",
                    paddingTop: "0.75rem",
                  }}
                >
                  <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                  <span>
                    Deadline: <strong>{endTime ? formatZoned(endTime) : "Not set"}</strong>
                  </span>
                </div>
              </div>

              {/* Server Enforcement Notice */}
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem",
                  borderRadius: 12,
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  fontSize: "0.8125rem",
                  color: "#6B6870",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 800, color: "#7A0C2E", marginBottom: "0.35rem" }}>
                  Server-Side Enforcement Rules:
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.75rem" }}>
                  <li>Stripe Checkout rejects new transactions before the start date or after the deadline.</li>
                  <li>Payments initiated before the deadline are honored if confirmed within grace window.</li>
                  <li>Vote pricing remains strictly preserved: $1/individual, $2/couple.</li>
                  <li>Changes sync via Supabase Realtime across all visitor browsers instantly.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
