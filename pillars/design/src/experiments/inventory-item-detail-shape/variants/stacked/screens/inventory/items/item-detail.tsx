import {
  createItemDetailStates,
  itemDetailDefault,
  meta,
} from '@/screens/inventory/items/item-detail';

export { meta };

export const states = createItemDetailStates('stacked');

const Default = itemDetailDefault('stacked');

export default function StackedItemDetailVariant() {
  return <Default />;
}
