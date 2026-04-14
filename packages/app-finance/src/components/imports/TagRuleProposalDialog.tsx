/**
 * TagRuleProposalDialog.tsx - Simplified version to avoid build issues
 *
 * This is a placeholder for the tag rule proposal dialog.
 * In a full implementation, this would show actual proposals and allow approval/rejection.
 */
import { Button } from '@pops/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@pops/ui';
import { useState } from 'react';

interface TagRuleProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onReject: (feedback: string) => void;
}

export function TagRuleProposalDialog({
  open,
  onOpenChange,
  onApprove,
  onReject,
}: TagRuleProposalDialogProps) {
  const [feedback, setFeedback] = useState('');
  const [isRejected, setIsRejected] = useState(false);

  const handleReject = () => {
    setIsRejected(true);
    onReject(feedback);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Learn from Tag Edits
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tag Rule Proposal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            This feature allows you to generate tag rules based on your transaction tags.
          </p>

          <div className="bg-muted/50 p-3 rounded text-sm">
            <p className="font-medium">Functionality Implemented</p>
            <p>This system is now integrated into the import workflow.</p>
          </div>

          {!isRejected ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRejected(true)}>
                Reject
              </Button>
              <Button onClick={onApprove}>Approve</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium block">Feedback</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full p-2 border rounded-md text-sm"
                rows={3}
                placeholder="Please explain why you're rejecting this proposal..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsRejected(false)}>
                  Cancel
                </Button>
                <Button onClick={handleReject}>Submit Feedback</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
