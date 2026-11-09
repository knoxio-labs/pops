/// M01 records approval of the native Today prototype and its Now then Next hierarchy.
@MainActor
internal enum TripTodayExperiment {
    internal static let experiment = DesignExperiment(
        id: "trip-today",
        question: "What appears first on mobile?",
        subject: TripTodaySurfaces.id,
        status: .decided(
            variant: TripTodayLayout.nextFirst.rawValue,
            rationale: "Approved by Joao on 10 November 2026: Now then Next, with active sources "
                + "first and known future starts in chronological order."
        ),
        variants: [
            DesignVariant(
                id: TripTodayLayout.nextFirst.rawValue,
                title: TripTodayLayout.nextFirst.title,
                note: "Active sources first, known future starts next, then date-only commitments.",
                surface: TripTodaySurfaces.surface(.nextFirst)
            )
        ]
    )
}
