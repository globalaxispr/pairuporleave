import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Vote, Loader2, AlertCircle } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";

interface PaymentDetails {
  status: string;
  candidate_name: string;
  candidate_category: string;
  vote_quantity: number;
  amount: number;
}

export function VoteSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid session. No session ID found.");
      setLoading(false);
      return;
    }

    async function verify() {
      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/verify-payment?session_id=${encodeURIComponent(sessionId!)}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
          }
        );
        const data = await resp.json() as PaymentDetails & { error?: string };
        if (!resp.ok || data.error) {
          throw new Error(data.error ?? "Could not verify payment.");
        }
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment verification failed.");
      } finally {
        setLoading(false);
      }
    }

    void verify();
  }, [sessionId, supabaseUrl]);

  return (
    <>
      <Helmet>
        <title>Thank You for Voting! — Pair Up or Leave</title>
      </Helmet>

      <main style={{ minHeight: "80vh", background: "#FFF8FA", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            border: "1px solid #F0DCE2",
            padding: "3rem 2.5rem",
            maxWidth: 480,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 8px 40px rgba(74,6,28,0.06)",
          }}
        >
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <Loader2 size={48} color="#E51B3E" style={{ animation: "spin 1s linear infinite" }} />
              <p style={{ color: "#6B6870", fontSize: "1rem", margin: 0 }}>Verifying your payment...</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : error ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertCircle size={36} color="#DC2626" />
              </div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#24131A", margin: 0 }}>Verification Failed</h1>
              <p style={{ color: "#6B6870", fontSize: "0.9375rem", margin: 0 }}>{error}</p>
              <Link to="/candidates">
                <button className="btn-primary" style={{ marginTop: "0.5rem" }}>Back to Candidates</button>
              </Link>
            </div>
          ) : details && details.status === "paid" ? (
            <>
              {/* Success */}
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "#DCFCE7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem",
                }}
              >
                <CheckCircle size={40} color="#16A34A" />
              </div>

              <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#24131A", margin: "0 0 0.5rem" }}>
                Thank You for Voting!
              </h1>
              <p style={{ fontSize: "1rem", color: "#6B6870", margin: "0 0 2rem" }}>
                Your payment was successfully processed and your votes have been counted.
              </p>

              {/* Details */}
              <div
                style={{
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  borderRadius: 16,
                  padding: "1.25rem",
                  marginBottom: "1.75rem",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {[
                    { label: "Candidate", value: details.candidate_name },
                    { label: "Category", value: details.candidate_category },
                    {
                      label: "Votes Cast",
                      value: (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: "#E51B3E", fontWeight: 800 }}>
                          <Vote size={14} />
                          {formatNumber(details.vote_quantity)} votes
                        </span>
                      ),
                    },
                    { label: "Amount Paid", value: formatCurrency(details.amount) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.875rem", color: "#6B6870" }}>{label}</span>
                      <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#24131A" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link to="/candidates">
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}>
                  Back to Candidates
                </button>
              </Link>
              <Link to="/results">
                <button className="btn-outline" style={{ width: "100%", justifyContent: "center" }}>
                  View Live Results
                </button>
              </Link>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertCircle size={36} color="#D97706" />
              </div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", margin: 0 }}>Payment Pending</h1>
              <p style={{ color: "#6B7280", fontSize: "0.9375rem", margin: 0 }}>Your payment is still being processed. Votes will be added once confirmed.</p>
              <Link to="/candidates">
                <button className="btn-primary" style={{ marginTop: "0.5rem" }}>Back to Candidates</button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
