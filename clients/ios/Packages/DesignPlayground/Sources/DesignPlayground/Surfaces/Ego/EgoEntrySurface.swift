@MainActor
internal enum EgoEntrySurface {
    internal static let surface = DesignSurface(
        id: SurfaceID(area: "ego", slug: "entry"),
        title: "Ego entry",
        synopsis: "Ego opens as a sheet over any screen from this tab bar control.",
        chrome: .bare,
        states: [
            DesignState("closed", "Closed") {
                EgoEntryShellView()
            },
        ]
    )
}
