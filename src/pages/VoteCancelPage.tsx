import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { XCircle, RotateCcw, ArrowLeft } from "lucide-react";

export function VoteCancelPage() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Payment Cancelled — Pair Up or Leave</title>
      </Helmet>

      <main
        style={{
          minHeight: "80vh",
          background: "#FFF8FA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            border: "1px solid #F0DCE2",
            padding: "3rem 2.5rem",
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 8px 40px rgba(74,6,28,0.06)",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "#FEF2F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <XCircle size={40} color="#DC2626" />
          </div>

          <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#24131A", margin: "0 0 0.5rem" }}>
            Payment Cancelled
          </h1>
          <p style={{ fontSize: "1rem", color: "#6B6870", margin: "0 0 0.5rem" }}>
            Your payment was cancelled.
          </p>
          <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: "0 0 2rem" }}>
            No votes were added to any candidate. Your card was not charged.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <button
              className="btn-vote"
              onClick={() => navigate(-1)}
              style={{ width: "100%", justifyContent: "center" }}
              aria-label="Try voting again"
            >
              <RotateCcw size={16} />
              Try Again
            </button>
            <Link to="/candidates">
              <button
                className="btn-outline"
                style={{ width: "100%", justifyContent: "center" }}
                aria-label="Return to candidates"
              >
                <ArrowLeft size={16} />
                Return to Candidates
              </button>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
