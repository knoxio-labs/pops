@MainActor
internal enum ErrorPresentationSurfaces {
    internal static let surfaces: [DesignSurface] = [
        failedAction,
        detail,
        diagnosticsEntry,
        recent,
    ]

    private static let failedAction = DesignSurface(
        id: SurfaceID(area: "shell", slug: "failed-action"),
        title: "Failed action",
        synopsis:
            "A failed user action stays in context: retryable failures leave automatically, "
            + "while a failure that needs attention stays until dismissed.",
        chrome: .bare,
        states: [
            DesignState("retryable", "Retryable — auto-dismiss") {
                FailedActionStage(error: ErrorPresentationFixtures.retryable)
            },
            DesignState("non-retryable", "Non-retryable — sticky") {
                FailedActionStage(error: ErrorPresentationFixtures.nonRetryable)
            },
        ]
    )

    private static let detail = DesignSurface(
        id: SurfaceID(area: "shell", slug: "error-detail"),
        title: "Error details",
        synopsis:
            "The user-safe message first, followed by the identifiers needed to report and trace "
            + "the failure, copied as one block.",
        chrome: .sheet,
        sheetDetents: .adjustable,
        states: [
            DesignState.standard {
                ErrorDetailSheet(error: ErrorPresentationFixtures.nonRetryable)
            },
            DesignState("copied", "Details copied") {
                ErrorDetailSheet(error: ErrorPresentationFixtures.nonRetryable, copied: true)
            },
        ],
        backdrop: {
            FailedActionStage(error: ErrorPresentationFixtures.nonRetryable)
        }
    )

    private static let recent = DesignSurface(
        id: SurfaceID(area: "shell", slug: "recent-errors"),
        title: "Recent errors",
        synopsis:
            "The latest 50 failures on this device, reached from the top-bar app menu until Pops "
            + "has a Settings screen.",
        chrome: .navigationLarge,
        states: [
            DesignState("populated", "Latest 50") {
                RecentErrorsView(errors: RecentErrors(ErrorPresentationFixtures.recent))
            },
            DesignState("empty", "No recent errors") {
                RecentErrorsView(errors: RecentErrors([]))
            },
        ]
    )

    private static let diagnosticsEntry = DesignSurface(
        id: SurfaceID(area: "shell", slug: "diagnostics-entry"),
        title: "App menu",
        synopsis:
            "Recent errors lives in each feature's top-bar app menu until Pops has a Settings "
            + "screen; it is support history, not a top-level destination.",
        chrome: .navigationAndTabs,
        states: [
            DesignState.standard {
                ErrorDiagnosticsEntryView()
            }
        ]
    )
}
