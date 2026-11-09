/// M01 records the chosen hierarchy; the prototype's visual review remains separate.
@MainActor
internal enum TripTodayExperiment {
    internal static let experiment = DesignExperiment(
        id: "trip-today",
        question: "What appears first on mobile?",
        subject: TripTodaySurfaces.id,
        status: .decided(
            variant: TripTodayLayout.nextFirst.rawValue,
            rationale: "Hierarchy selected: always show what is now, then what is next. "
                + "This records the ordering direction only; overall visual review remains open."
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
