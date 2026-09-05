/// Every ``DesignSurface`` in the receipts area: the capture prompt, the
/// outcome it produces, and the editable form a reading becomes.
@MainActor
internal enum ReceiptSurfaces {
    internal static let surfaces: [DesignSurface] = [
        ReceiptCaptureSurfaces.surface,
        ReceiptResultSurfaces.surface,
        ReceiptDraftSurfaces.surface,
    ]
}
