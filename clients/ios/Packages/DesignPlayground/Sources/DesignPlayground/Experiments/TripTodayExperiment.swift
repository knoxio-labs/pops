/// M01 compares upcoming travel and accommodation with the day's chronological commitments.
@MainActor
internal enum TripTodayExperiment {
    internal static let experiment = DesignExperiment(
        id: "trip-today",
        question: "Start with what is next, or follow the day in time order?",
        subject: TripTodaySurfaces.id,
        variants: TripTodayLayout.allCases.map { layout in
            DesignVariant(
                id: layout.rawValue,
                title: layout.title,
                note: layout == .nextFirst
                    ? "Promotes the next journey and current accommodation before other commitments."
                    : "Orders the same window by displayed day and time, keeping source details available.",
                surface: TripTodaySurfaces.surface(layout)
            )
        }
    )
}
