/**
 * DebriefResultsPage — route wrapper for /media/debrief/:sessionId/results.
 * Parses sessionId from URL params and renders DebriefResultsSummary.
 */
import { useParams, useNavigate } from "react-router";
import { Button } from "@pops/ui";
import { DebriefResultsSummary } from "../components/DebriefResultsSummary";

export function DebriefResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const id = Number(sessionId);

  if (!sessionId || isNaN(id)) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center text-muted-foreground">
        <p className="text-lg mb-2">Invalid session ID</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/media")}>
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <DebriefResultsSummary sessionId={id} />
    </div>
  );
}
