import { TypeEditor, createTypeEditorStates, meta } from '@/screens/inventory/types/type-editor';

export { meta };

export const states = createTypeEditorStates('focused');

export default function FocusedTypeEditorVariant() {
  return <TypeEditor layout="focused" />;
}
