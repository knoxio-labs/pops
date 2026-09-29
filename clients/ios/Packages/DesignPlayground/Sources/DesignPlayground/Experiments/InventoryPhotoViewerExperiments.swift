internal enum InventoryPhotoViewerExperiments {
    @MainActor internal static let all: [DesignExperiment] = [presentation]

    private static let subject = SurfaceID(area: "inventory", slug: "item-detail")

    @MainActor private static let presentation = DesignExperiment(
        id: "inventory-item-photo-viewer-presentation",
        question: "Should inventory photos open in a full-screen stage or a large sheet?",
        subject: subject,
        variants: [
            DesignVariant(
                id: "full-screen-stage",
                title: "Full-screen stage",
                note:
                    "Photos take the whole screen, with Close, Share and More in the toolbar "
                    + "and a compact caption below.",
                surface: surface(.fullScreen)
            ),
            DesignVariant(
                id: "large-sheet",
                title: "Large sheet",
                note:
                    "The photo task stays visibly attached to item detail while expanding to the large detent.",
                surface: surface(.sheet)
            ),
        ]
    )

    @MainActor private static func surface(
        _ presentation: InventoryPhotoViewerDesignPresentation
    ) -> DesignSurface {
        DesignSurface(
            id: subject,
            title: "Inventory photo viewer",
            synopsis: "Three photos, fit-preserving pages, and the actions around inspection.",
            chrome: .navigation,
            sheetDetents: .large,
            states: [
                DesignState.standard {
                    InventoryPhotoViewerExperimentView(presentation: presentation)
                }
            ]
        )
    }
}
