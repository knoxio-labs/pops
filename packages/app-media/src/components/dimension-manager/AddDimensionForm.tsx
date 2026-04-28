import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { Button, Input, Textarea } from '@pops/ui';

interface AddDimensionFormProps {
  addName: string;
  setAddName: (v: string) => void;
  addDescription: string;
  setAddDescription: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function AddDimensionForm({
  addName,
  setAddName,
  addDescription,
  setAddDescription,
  onAdd,
  onCancel,
  isPending,
}: AddDimensionFormProps) {
  return (
    <div className="space-y-2">
      <Input
        placeholder={t('dimensions.dimensionNamePlaceholder')}
        value={addName}
        onChange={(e) => {
          setAddName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd();
        }}
      />
      <Textarea
        placeholder={t('dimensions.descriptionOptional')}
        value={addDescription}
        onChange={(e) => {
          setAddDescription(e.target.value);
        }}
        rows={2}
        className="resize-none"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onAdd} disabled={!addName.trim() || isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add Dimension
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
