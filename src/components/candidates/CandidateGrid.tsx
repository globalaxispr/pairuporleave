import type { Candidate } from "@/lib/supabase";
import { CandidateCard } from "./CandidateCard";

interface CandidateGridProps {
  candidates: Candidate[];
  showRank?: boolean;
}

export function CandidateGrid({ candidates, showRank = true }: CandidateGridProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6 w-full"
      role="list"
      aria-label="Candidates list"
    >
      {candidates.map((candidate, index) => (
        <div
          key={candidate.id}
          role="listitem"
          className="candidate-card-wrapper w-full"
          style={{ animationDelay: `${index * 65}ms` }}
        >
          <CandidateCard
            candidate={candidate}
            rank={showRank ? index + 1 : undefined}
          />
        </div>
      ))}
    </div>
  );
}
