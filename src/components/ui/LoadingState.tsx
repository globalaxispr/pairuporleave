import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({ message = "Loading...", size = "md" }: LoadingStateProps) {
  const iconSize = size === "sm" ? 20 : size === "lg" ? 40 : 28;
  const textSize = size === "sm" ? "0.875rem" : size === "lg" ? "1.125rem" : "1rem";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: size === "sm" ? "2rem" : size === "lg" ? "6rem" : "4rem",
        gap: "1rem",
      }}
      aria-live="polite"
      aria-label={message}
    >
      <Loader2
        size={iconSize}
        color="#E51B3E"
        style={{ animation: "spin 1s linear infinite" }}
      />
      <p style={{ color: "#6B7280", fontSize: textSize, margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
