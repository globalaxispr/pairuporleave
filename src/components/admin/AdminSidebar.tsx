import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, CreditCard, BarChart3, FileText, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { perfNavStart } from "@/lib/adminPerf";

const navItems = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Candidates", to: "/admin/candidates", icon: Users },
  { label: "Score Ledger", to: "/admin/ledger", icon: FileText },
  { label: "Payments", to: "/admin/payments", icon: CreditCard },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  function isActive(to: string, exact?: boolean) {
    return exact ? location.pathname === to : location.pathname.startsWith(to);
  }

  return (
    <aside
      className="admin-sidebar"
      aria-label="Admin navigation"
      style={{ display: "flex", flexDirection: "column", padding: "1.5rem 1rem", gap: "0.25rem" }}
    >
      {/* Logo */}
      <div style={{ padding: "0 0.5rem", marginBottom: "2rem" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: "0.75rem", textDecoration: "none" }}>
          <picture>
            <source srcSet="/logo.webp" type="image/webp" />
            <img
              src="/logo@2x.png"
              alt="Pair Up or Leave"
              style={{
                height: 38,
                width: "auto",
                objectFit: "contain",
              }}
            />
          </picture>
        </Link>
        <div style={{ marginTop: "0.625rem", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.6rem", borderRadius: 9999, background: "rgba(255, 225, 232, 0.15)", fontSize: "0.6875rem", fontWeight: 700, color: "#FFE1E8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Admin Panel
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`admin-nav-item ${isActive(item.to, item.exact) ? "active" : ""}`}
            aria-current={isActive(item.to, item.exact) ? "page" : undefined}
            onClick={() => perfNavStart(location.pathname, item.to)}
          >
            <item.icon size={18} />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem", marginTop: "0.5rem" }}>
        <div style={{ padding: "0.5rem 1.25rem", marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.6)", marginBottom: "0.125rem" }}>Signed in as</div>
          <div style={{ fontSize: "0.875rem", color: "#ffffff", fontWeight: 600, wordBreak: "break-all" }}>
            {user?.email}
          </div>
        </div>
        <button
          className="admin-nav-item"
          onClick={() => {
            void signOut().then(() => navigate("/admin/login"));
          }}
          style={{ width: "100%", background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
          aria-label="Sign out of admin"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
