export interface TreeNode<T> {
  id: string;
  data: T;
  children: TreeNode<T>[];
}
