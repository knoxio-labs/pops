import AppCore
import Foundation

/// The sentences this feature shows that are not part of one row's data.
internal enum InventoryCopy {
    internal static let unavailable = "Inventory is not available on this phone right now."

    internal static let failureTitle = "That change did not save"
    internal static let storageFullMessage =
        "This phone is nearly out of storage, so that change was not saved."

    /// Why a write did not land, one sentence per failure, never the
    /// diagnostic a transport error carries.
    internal static func message(for failure: RepositoryError) -> String {
        switch failure {
        case .unavailable, .transport:
            "Inventory could not be reached. Nothing changed; try again when you are online."
        case .rateLimited:
            "Too many requests. Wait before trying again. Nothing changed."
        case .unauthorized:
            "This phone is no longer signed in, so nothing changed."
        case .contractMismatch:
            "The server would not take that change. Nothing changed."
        case .requestRejected:
            "This version of Pops sent a request the server cannot accept. Update the app. Nothing changed."
        case .conflict:
            "Something else changed first, so nothing changed."
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

    /// A `pops://` reference for a pillar this build has no screen for
    /// (POPS-4078). Mirrors the wording `App/RootCopy.swift`'s `opensIn(_:)`
    /// uses for the same case reached through the `pops` URL scheme, which
    /// this package cannot import: the app is the only thing above every
    /// feature.
    internal static func opensIn(_ pillar: String) -> String {
        "Opens in \(pillar.capitalized)"
    }

    /// A scanned code that looked like a `pops://` reference but did not
    /// parse as one.
    internal static let notAPopsCode = "Not a POPS code"

    /// A scanned code no item carries, as its own code or as a barcode or
    /// other identifier — including a tombstoned holder's code (POPS-4108),
    /// which stays reserved but is never found again.
    internal static let noItemHasThisCode = "No item has this code"

    internal static func itemsHaveThisCode(_ count: Int) -> String {
        "\(count) items have this code"
    }

    internal static let cameraAccessOff = "Camera access is off"

    /// Store here's scanner, waiting for a code.
    internal static func scanToStore(in target: String) -> String {
        "Scan to store in \(target)"
    }

    internal static func stored(in target: String) -> String {
        "Stored in \(target)"
    }

    internal static func alreadyStored(in target: String) -> String {
        "Already in \(target)"
    }

    /// A scanned item Store here refuses: the target itself, a container the
    /// target sits inside, or an item that is no longer active.
    internal static func cannotStore(in target: String) -> String {
        "Can't be stored in \(target)"
    }

    /// A scanned `pops://` reference to a place, or to another pillar's
    /// record, where only an item can be stored.
    internal static let notAnItem = "Not an item"

    internal static let photoStorageFull =
        "This phone is nearly out of storage, so the photo was not kept."

    /// Why a photo staged on this phone will not upload as it stands.
    internal static func message(for failure: InventoryPhotoUploadFailure) -> String {
        switch failure {
        case .tooLarge: "This photo is too large to upload."
        case .unsupported: "This photo's format can't be uploaded."
        case .bytesMissing: "This photo is no longer on this phone."
        }
    }
}
