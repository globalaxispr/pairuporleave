import type { ReactNode } from "react";
import { Users } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
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
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "#FFF3F5",
          border: "1px solid #F0DCE2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "0.5rem",
        }}
      >
        {icon ?? <Users size={32} color="#7A0C2E" />}
      </div>
      <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0, maxWidth: 360 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: "0.5rem" }}>{action}</div>}
    </div>
  );
}
