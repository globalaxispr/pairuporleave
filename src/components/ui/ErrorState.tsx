import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this information right now. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "5rem 2rem",
        textAlign: "center",
        gap: "1rem",
      }}
      role="alert"
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AlertCircle size={32} color="#DC2626" />
      </div>
      <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>{title}</h3>
      <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0, maxWidth: 360 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-primary"
          style={{ marginTop: "0.5rem" }}
          aria-label="Try again"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      )}
    </div>
  );
}
