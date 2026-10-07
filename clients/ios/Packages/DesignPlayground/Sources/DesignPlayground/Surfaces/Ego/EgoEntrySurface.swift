@MainActor
internal enum EgoEntrySurface {
    internal static let surface = DesignSurface(
        id: SurfaceID(area: "ego", slug: "entry"),
        title: "Ego entry",
        synopsis: "Ego opens as a sheet from the compact launcher beside Search.",
        chrome: .bare,
        states: [
            DesignState("closed", "Closed") {
                EgoEntryShellView()
            }
        ]
    )
}
