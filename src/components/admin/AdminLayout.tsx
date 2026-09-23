import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#FFF8FA",
      }}
    >
      {/* Sidebar */}
      <div className="admin-sidebar-wrap" style={{ position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
        <AdminSidebar />
      </div>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          padding: "2rem",
        }}
      >
        {children}
      </main>

      <style>{`
        @media (max-width: 900px) {
          .admin-sidebar-wrap { display: none; }
        }
      `}</style>
    </div>
  );
}
