# Item detail page

`/inventory/items/:id` is assembled from the web item read and the existing
item, location, photo, connection, document, and Paperless endpoints. The web
read supplies lifecycle, dynamic fields, computed values, provenance, and
history; compatible legacy reads fill fields that are not yet projected there.

The page keeps the facts rail beside three tabs: Overview, Connections, and
History. The rail is resizable between 240px and 480px, moves in 16px keyboard
steps, and resets with Enter or double-click. At smaller widths it becomes the
Facts tab.

Destroyed items remain visible for audit history but are read-only. Edit,
delete, connection, photo-reorder, document-link, and document-unlink actions
are disabled with a short explanation. Paperless outages keep linked
documents visible and disable Paperless actions with an inline reason.
