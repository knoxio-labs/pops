import AppCore

/// Where the home's one read has got to.
internal enum PurchasesHomePhase: Equatable {
    /// Nothing has answered yet, so there is nothing to keep on screen.
    case loading
    case loaded([Purchase], refresh: PurchasesHomeRefresh = .current)
    /// The first read failed, so there is no content to keep.
    case failed(PurchasesHomeFailure)
}

/// A refresh over content already on screen. The content stays in every case:
/// a refresh that failed is not a reason to take away what the last one got.
internal enum PurchasesHomeRefresh: Equatable {
    case current
    case refreshing
    /// The last refresh failed; `updated` is when the content on screen was
    /// fetched.
    case failed(updated: String)
}

/// The five ways a read can leave the home with nothing to draw, as the
/// repository reports them. Each is told apart by its own glyph and title,
/// and none of them looks like the empty history, because none of them is
/// one.
internal enum PurchasesHomeFailure: String, CaseIterable, Identifiable {
    case unavailable
    case unauthorized
    case contractMismatch
    case transport
    case dependencyNotBound

    internal var id: String { rawValue }

    internal var symbol: String {
        switch self {
        case .unavailable: "exclamationmark.icloud"
        case .unauthorized: "person.crop.circle.badge.exclamationmark"
        case .contractMismatch: "arrow.down.app"
        case .transport: "wifi.slash"
        case .dependencyNotBound: "powerplug"
        }
    }

    internal var title: String {
        switch self {
        case .unavailable: "Purchases is down"
        case .unauthorized: "Session ended"
        case .contractMismatch: "Update Pops"
        case .transport: "No connection"
        case .dependencyNotBound: "Not connected"
        }
    }

    internal var message: String {
        switch self {
        case .unavailable: "The server didn't answer."
        case .unauthorized: "Pair this phone again to see purchases."
        case .contractMismatch: "This version can't read purchases any more."
        case .transport: "Purchases load when you're back online."
        case .dependencyNotBound: "This build has no purchases service."
        }
    }

    /// What the one button does, or nothing when no button would help:
    /// an old build and a build missing a service are fixed by a new build.
    internal var action: PurchasesHomeFailureAction? {
        switch self {
        case .unavailable, .transport: .retry
        case .unauthorized: .pair
        case .contractMismatch, .dependencyNotBound: nil
        }
    }
}

internal enum PurchasesHomeFailureAction: Equatable {
    case retry
    case pair

    internal var title: String {
        switch self {
        case .retry: "Try again"
        case .pair: "Pair again"
        }
    }
}
