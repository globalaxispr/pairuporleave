import { Search, X } from "lucide-react";

interface CandidateFilterProps {
  search: string;
  onSearchChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
  categories: string[];
}

const SORT_OPTIONS = [
  { value: "votes_desc", label: "Most Votes" },
  { value: "name_asc", label: "A–Z" },
  { value: "created_desc", label: "Recently Added" },
  { value: "votes_asc", label: "Least Votes" },
];

export function CandidateFilter({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  categories,
}: CandidateFilterProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
        marginBottom: "1.75rem",
        width: "100%",
      }}
      role="search"
      aria-label="Filter candidates"
    >
      {/* Full Width Search Field */}
      <div style={{ position: "relative", width: "100%" }}>
        <Search
          size={18}
          color="#6B6870"
          style={{
            position: "absolute",
            left: "1rem",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        />
        <input
          type="search"
          placeholder="Search candidates by name, position, or category..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input-field"
          style={{
            width: "100%",
            paddingLeft: "2.75rem",
            paddingRight: search ? "2.75rem" : "1rem",
            minHeight: 48,
            fontSize: "1rem",
            borderRadius: 14,
            border: "1.5px solid #F0DCE2",
          }}
          aria-label="Search candidates"
          id="candidate-search"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            style={{
              position: "absolute",
              right: "0.875rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: "0.25rem",
              cursor: "pointer",
              color: "#6B6870",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Horizontal Scrollable Category Filter Chips */}
      <div>
        <div
          className="no-scrollbar"
          style={{
            display: "flex",
            gap: "0.5rem",
            overflowX: "auto",
            paddingBottom: "0.25rem",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <button
            onClick={() => onCategoryChange("")}
            style={{
              padding: "0.5rem 1.125rem",
              borderRadius: 99,
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              border: "1.5px solid",
              borderColor: category === "" ? "#7A0C2E" : "#F0DCE2",
              background: category === "" ? "#7A0C2E" : "#FFFFFF",
              color: category === "" ? "#FFFFFF" : "#24131A",
              whiteSpace: "nowrap",
              minHeight: 40,
              transition: "all 0.15s ease",
            }}
          >
            All Categories
          </button>

          {categories.map((cat) => {
            const isActive = category === cat;
            return (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: 99,
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "1.5px solid",
                  borderColor: isActive ? "#7A0C2E" : "#F0DCE2",
                  background: isActive ? "#7A0C2E" : "#FFFFFF",
                  color: isActive ? "#FFFFFF" : "#24131A",
                  whiteSpace: "nowrap",
                  minHeight: 40,
                  transition: "all 0.15s ease",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort Selector Row */}
      <div
        className="no-scrollbar"
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "0.25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {SORT_OPTIONS.map((opt) => {
          const isSelected = sort === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSortChange(opt.value)}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: 8,
                fontSize: "0.8125rem",
                fontWeight: isSelected ? 700 : 500,
                cursor: "pointer",
                border: `1px solid ${isSelected ? "#E51B3E" : "#F0DCE2"}`,
                background: isSelected ? "#FFE1E8" : "#FFF8FA",
                color: isSelected ? "#7A0C2E" : "#6B6870",
                whiteSpace: "nowrap",
                minHeight: 36,
                transition: "all 0.15s ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
