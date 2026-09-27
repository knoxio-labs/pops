/** Describes one image rendered by an image gallery. */
export interface ImageGalleryItem {
  id: string;
  src: string;
  caption?: string;
  alt?: string;
}

/** Configures the image gallery and its optional lightbox actions. */
export interface ImageGalleryProps {
  items: ImageGalleryItem[];
  /** Optional delete callback per item. If provided, renders a delete button. */
  onDelete?: (id: string) => void;
  /** Enable arrow-key navigation in the lightbox. Default `true`. */
  keyboardNav?: boolean;
  className?: string;
}
