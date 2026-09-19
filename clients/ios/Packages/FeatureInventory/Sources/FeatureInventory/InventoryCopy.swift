import AppCore
import Foundation

/// The sentences this feature shows that are not part of one row's data.
internal enum InventoryCopy {
    internal static let unavailable = "Inventory is not available on this phone right now."

    internal static let failureTitle = "That change did not save"

    /// Why a write did not land, one sentence per failure, never the
    /// diagnostic a transport error carries.
    internal static func message(for failure: RepositoryError) -> String {
        switch failure {
        case .unavailable, .transport:
            "Inventory could not be reached. Nothing changed; try again when you are online."
        case .unauthorized:
            "This phone is no longer signed in, so nothing changed."
        case .contractMismatch:
            "The server would not take that change. Nothing changed."
        case .dependencyNotBound:
            "Inventory is not set up in this build, so nothing changed."
        }
    }

    /// A row's second line: where the thing is, then when, with the place
    /// left out when there is none to name.
    internal static func detail(place: String?, at date: Date, now: Date = .now) -> String {
        let when = InventoryRelativeTime.text(date, now: now)
        guard let place else { return when }
        return "\(place) · \(when)"
    }
}
