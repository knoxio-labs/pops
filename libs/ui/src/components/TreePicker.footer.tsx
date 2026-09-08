import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { type TreeNode } from './TreeView';

interface NoMatchesProps<T> {
  query: string;
  onCreate?: (query: string, parent: TreeNode<T> | null) => void;
  onCreated: () => void;
}

export function NoMatches<T>({ query, onCreate, onCreated }: NoMatchesProps<T>) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
      <div>No matches for &ldquo;{query}&rdquo;</div>
      {onCreate && query.trim() ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onCreate(query.trim(), null);
            onCreated();
          }}
        >
          <Plus /> Create &ldquo;{query.trim()}&rdquo;
        </Button>
      ) : null}
    </div>
  );
}

interface AddNodeFormProps {
  createLabel: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function AddNodeForm({ createLabel, onSave, onCancel }: AddNodeFormProps) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={`${createLabel}…`}
        className="h-7 flex-1"
      />
      <Button
        size="sm"
        variant="default"
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
        className="h-7 px-2 text-xs"
      >
        Add
      </Button>
    </div>
  );
}

export interface PickerFooterProps<T> {
  hasSelection: boolean;
  onClear?: () => void;
  onCreate?: (name: string, parent: TreeNode<T> | null) => void;
  createLabel: string;
}

/**
 * Footer slot for `TreePicker`: an optional "Clear selection" row (shown
 * while a node is selected) and a persistent "create" row that opens its own
 * name field, independent of the main search query. Additive to the
 * search-driven no-matches create flow in `NoMatches`, not a replacement.
 */
export function PickerFooter<T>({
  hasSelection,
  onClear,
  onCreate,
  createLabel,
}: PickerFooterProps<T>) {
  const [showAddForm, setShowAddForm] = useState(false);

  if (!onClear && !onCreate) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-border p-1.5">
      {onClear && hasSelection ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" /> Clear selection
        </Button>
      ) : null}
      {onCreate && !showAddForm ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-3.5 w-3.5" /> {createLabel}
        </Button>
      ) : null}
      {onCreate && showAddForm ? (
        <AddNodeForm
          createLabel={createLabel}
          onSave={(name) => {
            onCreate(name, null);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : null}
    </div>
  );
}
