import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Plus, Edit, Trash2, Pause, Play, Loader2, X, Upload, AlertCircle, Users, User, Gift, ShieldAlert, History } from "lucide-react";
import { supabase, type Candidate, type CandidateType, fetchCandidatesSafe, getCandidateScore, IS_SUPABASE_READY } from "@/lib/supabase";
import { formatNumber, slugify } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ScoreAdjustmentModal } from "@/components/admin/ScoreAdjustmentModal";
import { CandidateScoreHistoryModal } from "@/components/admin/CandidateScoreHistoryModal";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

const EMPTY_FORM = {
  candidate_type: "individual" as CandidateType,
  name: "",
  display_name: "",
  person_one_name: "",
  person_two_name: "",
  person_one_photo_url: "",
  person_two_photo_url: "",
  slug: "",
  category: "",
  position: "",
  description: "",
  biography: "",
  vision: "",
  photo_url: "",
  status: "active" as "active" | "paused",
};

type FormState = typeof EMPTY_FORM;

interface PhotoFiles {
  main?: File;
  personOne?: File;
  personTwo?: File;
}

function CandidateForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: FormState;
  onSave: (form: FormState, photoFiles: PhotoFiles) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);
  const [photoFiles, setPhotoFiles] = useState<PhotoFiles>({});
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial.photo_url || null);
  const [p1Preview, setP1Preview] = useState<string | null>(initial.person_one_photo_url || null);
  const [p2Preview, setP2Preview] = useState<string | null>(initial.person_two_photo_url || null);

  function set(field: keyof FormState, value: any) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug if not editing existing slug
      if (field === "name" && !initial.slug && next.candidate_type === "individual") {
        next.slug = slugify(value);
      } else if (field === "display_name" && !initial.slug && next.candidate_type === "couple") {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function handleFile(key: keyof PhotoFiles, file: File, setPreview: (url: string) => void) {
    setPhotoFiles((prev) => ({ ...prev, [key]: file }));
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  const isCouple = form.candidate_type === "couple";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }} role="alert">
          <AlertCircle size={16} color="#DC2626" />
          <span style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</span>
        </div>
      )}

      {/* Candidate Type Switcher */}
      <div>
        <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.5rem" }}>
          Candidate Type
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => set("candidate_type", "individual")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              borderRadius: 10,
              fontSize: "0.875rem",
              fontWeight: 700,
              border: `2px solid ${!isCouple ? "#7A0C2E" : "#F0DCE2"}`,
              background: !isCouple ? "#FFE1E8" : "#FFFFFF",
              color: !isCouple ? "#7A0C2E" : "#6B6870",
              cursor: "pointer",
            }}
          >
            <User size={16} />
            Individual ($1/vote)
          </button>
          <button
            type="button"
            onClick={() => set("candidate_type", "couple")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              borderRadius: 10,
              fontSize: "0.875rem",
              fontWeight: 700,
              border: `2px solid ${isCouple ? "#E51B3E" : "#F0DCE2"}`,
              background: isCouple ? "#FFF3F5" : "#FFFFFF",
              color: isCouple ? "#E51B3E" : "#6B6870",
              cursor: "pointer",
            }}
          >
            <Users size={16} />
            Couple ($2/vote)
          </button>
        </div>
      </div>

      {/* Couple Specific Fields */}
      {isCouple ? (
        <div style={{ background: "#FFF8FA", border: "1px solid #F0DCE2", borderRadius: 12, padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "#7A0C2E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Couple Information (Two Persons Together)
          </div>

          <div>
            <label htmlFor="field-display-name" style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
              Couple Display Name (e.g., &quot;Michael &amp; Sarah Anderson&quot;) *
            </label>
            <input
              id="field-display-name"
              type="text"
              value={form.display_name}
              onChange={(e) => {
                set("display_name", e.target.value);
                set("name", e.target.value);
              }}
              required
              className="input-field"
              placeholder="Partner 1 & Partner 2 Lastname"
              style={{ fontSize: "0.9rem" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Person 1 */}
            <div style={{ background: "#FFFFFF", padding: "0.75rem", borderRadius: 10, border: "1px solid #F0DCE2" }}>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                Person 1 Name *
              </label>
              <input
                type="text"
                value={form.person_one_name}
                onChange={(e) => set("person_one_name", e.target.value)}
                required
                className="input-field"
                placeholder="e.g. Michael Anderson"
                style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, border: "1px solid #F0DCE2", background: "#FFF8FA", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p1Preview ? (
                    <img src={p1Preview} alt="Person 1" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <User size={20} color="#7A0C2E" />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="p1-upload"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFile("personOne", e.target.files[0], setP1Preview)}
                    style={{ display: "none" }}
                  />
                  <label htmlFor="p1-upload" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.375rem 0.625rem", background: "#FFE1E8", border: "1px solid #F0DCE2", borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, color: "#7A0C2E" }}>
                    <Upload size={12} />
                    Upload Photo
                  </label>
                </div>
              </div>
            </div>

            {/* Person 2 */}
            <div style={{ background: "#FFFFFF", padding: "0.75rem", borderRadius: 10, border: "1px solid #F0DCE2" }}>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                Person 2 Name *
              </label>
              <input
                type="text"
                value={form.person_two_name}
                onChange={(e) => set("person_two_name", e.target.value)}
                required
                className="input-field"
                placeholder="e.g. Sarah Anderson"
                style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, border: "1px solid #F0DCE2", background: "#FFF8FA", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p2Preview ? (
                    <img src={p2Preview} alt="Person 2" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <User size={20} color="#7A0C2E" />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="p2-upload"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFile("personTwo", e.target.files[0], setP2Preview)}
                    style={{ display: "none" }}
                  />
                  <label htmlFor="p2-upload" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.375rem 0.625rem", background: "#FFE1E8", border: "1px solid #F0DCE2", borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, color: "#7A0C2E" }}>
                    <Upload size={12} />
                    Upload Photo
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Individual Photo upload */
        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#24131A", marginBottom: "0.5rem" }}>
            Candidate Photo
          </label>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: 12, border: "1px solid #F0DCE2", background: "#FFF8FA", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Upload size={24} color="#7A0C2E" />
              )}
            </div>
            <div>
              <input
                type="file"
                id="photo-upload"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile("main", e.target.files[0], setPhotoPreview)}
                style={{ display: "none" }}
              />
              <label htmlFor="photo-upload" style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", background: "#FFE1E8", border: "1px solid #F0DCE2", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, color: "#7A0C2E" }}>
                <Upload size={14} />
                Upload Photo
              </label>
              <div style={{ fontSize: "0.75rem", color: "#6B6870", marginTop: "0.25rem" }}>JPG, PNG, WebP (max 5MB)</div>
            </div>
          </div>
        </div>
      )}

      {/* Common Information Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {!isCouple && (
          <div>
            <label htmlFor="field-name" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem" }}>
              Full Name *
            </label>
            <input
              id="field-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              className="input-field"
              style={{ fontSize: "0.9rem" }}
            />
          </div>
        )}

        <div>
          <label htmlFor="field-slug" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem" }}>
            URL Slug *
          </label>
          <input
            id="field-slug"
            type="text"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            required
            className="input-field"
            style={{ fontSize: "0.9rem" }}
          />
        </div>

        <div>
          <label htmlFor="field-category" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem" }}>
            Category *
          </label>
          <input
            id="field-category"
            type="text"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            required
            className="input-field"
            style={{ fontSize: "0.9rem" }}
          />
        </div>

        <div>
          <label htmlFor="field-position" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem" }}>
            Position / Title *
          </label>
          <input
            id="field-position"
            type="text"
            value={form.position}
            onChange={(e) => set("position", e.target.value)}
            required
            className="input-field"
            style={{ fontSize: "0.9rem" }}
          />
        </div>
      </div>

      {(["description", "biography", "vision"] as const).map((field) => (
        <div key={field}>
          <label htmlFor={`field-${field}`} style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem", textTransform: "capitalize" }}>
            {field.charAt(0).toUpperCase() + field.slice(1)}
          </label>
          <textarea
            id={`field-${field}`}
            value={form[field]}
            onChange={(e) => set(field, e.target.value)}
            rows={field === "description" ? 2 : 4}
            className="input-field"
            style={{ resize: "vertical", fontSize: "0.9rem" }}
          />
        </div>
      ))}

      <div>
        <label style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#374151", marginBottom: "0.375rem" }}>Status</label>
        <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input-field" style={{ appearance: "none" }}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.5rem" }}>
        <button className="btn-outline" onClick={onCancel} style={{ fontSize: "0.9rem" }} type="button">Cancel</button>
        <button
          className="btn-primary"
          onClick={() => onSave(form, photoFiles)}
          disabled={saving}
          style={{ fontSize: "0.9rem", opacity: saving ? 0.8 : 1 }}
          type="button"
        >
          {saving ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Saving...</> : "Save Candidate"}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function AdminCandidatesPage() {
  perfPageMount("AdminCandidatesPage");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Score Adjustment & History Modals
  const [adjustmentModal, setAdjustmentModal] = useState<{
    open: boolean;
    type: "BONUS" | "PENALTY";
    candidate: Candidate | null;
  }>({ open: false, type: "BONUS", candidate: null });

  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    candidate: Candidate | null;
  }>({ open: false, candidate: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      perfMark("Supabase candidates query START");

      if (IS_SUPABASE_READY) {
        const { data, error } = await supabase
          .from("candidates")
          .select("*")
          .order("current_score", { ascending: false });
        perfMark("Supabase candidates query END");

        if (!error && data && data.length > 0) {
          setCandidates(
            data.map((c) => ({
              ...c,
              current_score: c.current_score ?? c.total_votes ?? 0,
              paid_votes: c.paid_votes ?? c.total_votes ?? 0,
              bonus_votes: c.bonus_votes ?? 0,
              penalty_points: c.penalty_points ?? 0,
            }))
          );
          return;
        }
      } else {
        perfMark("Supabase candidates query END");
      }

      const demo = await fetchCandidatesSafe();
      setCandidates(demo);
    } catch {
      const demo = await fetchCandidatesSafe();
      setCandidates(demo);
    } finally {
      setLoading(false);
      perfNavEnd("Candidates total");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function uploadPhoto(file: File, filename: string): Promise<string> {
    const ext = file.name.split(".").pop();
    const path = `candidates/${filename}.${ext}`;
    const { error } = await supabase.storage.from("candidates").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("candidates").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave(form: FormState, files: PhotoFiles) {
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = !!editTarget;
      const candidateId = editTarget?.id ?? crypto.randomUUID();

      let photo_url = form.photo_url;
      let person_one_photo_url = form.person_one_photo_url;
      let person_two_photo_url = form.person_two_photo_url;

      if (files.main) {
        photo_url = await uploadPhoto(files.main, `${candidateId}_main`);
      }
      if (files.personOne) {
        person_one_photo_url = await uploadPhoto(files.personOne, `${candidateId}_p1`);
      }
      if (files.personTwo) {
        person_two_photo_url = await uploadPhoto(files.personTwo, `${candidateId}_p2`);
      }

      const isCouple = form.candidate_type === "couple";
      const resolvedName = isCouple
        ? (form.display_name || `${form.person_one_name} & ${form.person_two_name}`.trim())
        : form.name;

      const payload = {
        candidate_type: form.candidate_type,
        name: resolvedName,
        display_name: isCouple ? form.display_name : null,
        person_one_name: isCouple ? form.person_one_name : null,
        person_two_name: isCouple ? form.person_two_name : null,
        person_one_photo_url: isCouple ? person_one_photo_url : null,
        person_two_photo_url: isCouple ? person_two_photo_url : null,
        category: form.category,
        position: form.position,
        description: form.description,
        biography: form.biography,
        vision: form.vision,
        status: form.status,
        photo_url,
        slug: form.slug || slugify(resolvedName),
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase.from("candidates").update(payload).eq("id", editTarget!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("candidates").insert({ ...payload, id: candidateId });
        if (error) throw error;
      }

      setFormOpen(false);
      setEditTarget(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save candidate.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(c: Candidate) {
    const newStatus = c.status === "active" ? "paused" : "active";
    await supabase.from("candidates").update({ status: newStatus }).eq("id", c.id);
    await load();
  }

  async function deleteCandidate(id: string) {
    if (!confirm("Are you sure you want to delete this candidate? This cannot be undone.")) return;
    await supabase.from("candidates").delete().eq("id", id);
    await load();
  }

  return (
    <AdminLayout>
      <Helmet><title>Candidates — Pair Up or Leave Admin</title></Helmet>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>Candidates</h1>
          <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>
            {candidates.length} total candidates ({candidates.filter((c) => c.candidate_type === "couple").length} couples, {candidates.filter((c) => c.candidate_type !== "couple").length} individual)
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditTarget(null); setFormOpen(true); setFormError(null); }} aria-label="Add new candidate" id="add-candidate-btn">
          <Plus size={16} />
          Add Candidate
        </button>
      </div>

      {/* Form modal */}
      {formOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#24131A", margin: 0 }}>
                {editTarget ? "Edit Candidate" : "Add Candidate"}
              </h2>
              <button onClick={() => setFormOpen(false)} style={{ background: "#FFF8FA", border: "1px solid #F0DCE2", borderRadius: 8, cursor: "pointer", padding: "0.375rem", display: "flex" }}>
                <X size={18} color="#6B6870" />
              </button>
            </div>
            <CandidateForm
              initial={editTarget ? {
                candidate_type: editTarget.candidate_type || "individual",
                name: editTarget.name,
                display_name: editTarget.display_name || "",
                person_one_name: editTarget.person_one_name || "",
                person_two_name: editTarget.person_two_name || "",
                person_one_photo_url: editTarget.person_one_photo_url || "",
                person_two_photo_url: editTarget.person_two_photo_url || "",
                slug: editTarget.slug,
                category: editTarget.category,
                position: editTarget.position,
                description: editTarget.description ?? "",
                biography: editTarget.biography ?? "",
                vision: editTarget.vision ?? "",
                photo_url: editTarget.photo_url ?? "",
                status: editTarget.status,
              } : EMPTY_FORM}
              onSave={handleSave}
              onCancel={() => setFormOpen(false)}
              saving={saving}
              error={formError}
            />
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
        </div>
      ) : (
        <div style={{ background: "#ffffff", border: "1px solid #F0DCE2", borderRadius: 16, overflow: "hidden" }} className="card-shadow">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}>
                  {["Candidate", "Type", "Category", "Score & Breakdown", "Status", "Score Actions", "Manage"].map((h) => (
                    <th key={h} style={{ padding: "0.875rem 1rem", textAlign: "left", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => {
                  const isCouple = c.candidate_type === "couple";
                  const score = getCandidateScore(c);
                  const paid = c.paid_votes ?? c.total_votes ?? 0;
                  const bonus = c.bonus_votes ?? 0;
                  const penalty = c.penalty_points ?? 0;

                  return (
                    <tr key={c.id} style={{ borderBottom: i < candidates.length - 1 ? "1px solid #FDF2F4" : "none" }}>
                      <td style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {/* Avatar */}
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, #7A0C2E, #E51B3E)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.875rem", flexShrink: 0, overflow: "hidden" }}>
                          {isCouple && c.person_one_photo_url && c.person_two_photo_url ? (
                            <div style={{ display: "flex", width: "100%", height: "100%" }}>
                              <img src={c.person_one_photo_url} alt="P1" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                              <img src={c.person_two_photo_url} alt="P2" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                            </div>
                          ) : c.photo_url ? (
                            <img src={c.photo_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            c.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#24131A", fontSize: "0.9375rem" }}>
                            {c.display_name || c.name}
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "#6B6870" }}>
                            {c.position}
                            {isCouple && c.person_one_name && c.person_two_name && (
                              <span style={{ color: "#7A0C2E" }}> ({c.person_one_name} &amp; {c.person_two_name})</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        {isCouple ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#FFE1E8", color: "#7A0C2E", border: "1px solid #F0DCE2", padding: "0.25rem 0.625rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 700 }}>
                            <Users size={12} />
                            Couple ($2/vote)
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", padding: "0.25rem 0.625rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 700 }}>
                            <User size={12} />
                            Individual ($1/vote)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "1rem" }}><span className="badge" style={{ background: "#FFE1E8", color: "#7A0C2E" }}>{c.category}</span></td>
                      
                      {/* Score & Breakdown */}
                      <td style={{ padding: "1rem" }}>
                        <div style={{ fontWeight: 900, color: "#E51B3E", fontSize: "1.0625rem" }}>
                          {formatNumber(score)} pts
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "#6B6870", marginTop: "0.125rem" }}>
                          Paid: <strong>{formatNumber(paid)}</strong> | <span style={{ color: "#059669", fontWeight: 700 }}>+{formatNumber(bonus)}</span> | <span style={{ color: "#DC2626", fontWeight: 700 }}>-{formatNumber(penalty)}</span>
                        </div>
                      </td>

                      <td style={{ padding: "1rem" }}>
                        <span className={`badge ${c.status === "active" ? "badge-green" : "badge-red"}`}>
                          {c.status === "active" ? "Active" : "Paused"}
                        </span>
                      </td>

                      {/* Score Actions */}
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                          <button
                            onClick={() => setAdjustmentModal({ open: true, type: "BONUS", candidate: c })}
                            title="Give Bonus Votes"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              padding: "0.3rem 0.6rem",
                              border: "1px solid #F0DCE2",
                              borderRadius: 8,
                              background: "#FFE1E8",
                              color: "#7A0C2E",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Gift size={13} />
                            Bonus
                          </button>
                          <button
                            onClick={() => setAdjustmentModal({ open: true, type: "PENALTY", candidate: c })}
                            title="Apply Penalty"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              padding: "0.3rem 0.6rem",
                              border: "1px solid #FECACA",
                              borderRadius: 8,
                              background: "#FEF2F2",
                              color: "#DC2626",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <ShieldAlert size={13} />
                            Penalty
                          </button>
                          <button
                            onClick={() => setHistoryModal({ open: true, candidate: c })}
                            title="View Score History &amp; Ledger"
                            style={{
                              padding: "0.3rem 0.45rem",
                              border: "1px solid #F0DCE2",
                              borderRadius: 8,
                              background: "#FFF8FA",
                              color: "#6B6870",
                              cursor: "pointer",
                              display: "flex",
                            }}
                          >
                            <History size={14} />
                          </button>
                        </div>
                      </td>

                      {/* Manage */}
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.375rem" }}>
                          <button onClick={() => { setEditTarget(c); setFormOpen(true); setFormError(null); }} title="Edit" style={{ padding: "0.375rem", border: "1px solid #F0DCE2", borderRadius: 8, background: "#FFF8FA", cursor: "pointer", display: "flex" }}><Edit size={14} color="#6B6870" /></button>
                          <button onClick={() => void toggleStatus(c)} title={c.status === "active" ? "Pause" : "Activate"} style={{ padding: "0.375rem", border: "1px solid #F0DCE2", borderRadius: 8, background: "#FFF8FA", cursor: "pointer", display: "flex" }}>
                            {c.status === "active" ? <Pause size={14} color="#D97706" /> : <Play size={14} color="#16A34A" />}
                          </button>
                          <button onClick={() => void deleteCandidate(c.id)} title="Delete" style={{ padding: "0.375rem", border: "1px solid #FECACA", borderRadius: 8, background: "#FEF2F2", cursor: "pointer", display: "flex" }}><Trash2 size={14} color="#DC2626" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score Adjustment Modal */}
      {adjustmentModal.open && adjustmentModal.candidate && (
        <ScoreAdjustmentModal
          type={adjustmentModal.type}
          candidate={adjustmentModal.candidate}
          allCandidates={candidates}
          onClose={() => setAdjustmentModal({ open: false, type: "BONUS", candidate: null })}
          onSuccess={() => void load()}
        />
      )}

      {/* Candidate Score History Modal */}
      {historyModal.open && historyModal.candidate && (
        <CandidateScoreHistoryModal
          candidate={historyModal.candidate}
          onClose={() => setHistoryModal({ open: false, candidate: null })}
          onGiveBonus={() => {
            const cand = historyModal.candidate!;
            setHistoryModal({ open: false, candidate: null });
            setAdjustmentModal({ open: true, type: "BONUS", candidate: cand });
          }}
          onApplyPenalty={() => {
            const cand = historyModal.candidate!;
            setHistoryModal({ open: false, candidate: null });
            setAdjustmentModal({ open: true, type: "PENALTY", candidate: cand });
          }}
        />
      )}
    </AdminLayout>
  );
}
