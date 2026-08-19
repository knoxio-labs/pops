import AppCore
import Foundation

/// Every word this module shows, in one place — matching `FeatureTransactions`
/// and `FeaturePairing`: the app has no localisation layer, and copy
/// scattered through a view makes adding one a hunt.
internal enum ReceiptCaptureCopy {
    internal static let title = "Receipt capture"
    internal static let instruction =
        "Photograph the receipt. A long one can be several photos — take them "
        + "top to bottom and they'll be read as one receipt."
    internal static let captureButton = "Photograph a receipt"
    internal static let captureAnother = "Photograph another receipt"

    // MARK: camera refusals

    /// Undoable from Settings, so this is the only one offered a link.
    internal static let cameraDenied =
        "Pops can't use the camera. Allow camera access in Settings to photograph a receipt."
    internal static let cameraRestricted =
        "Camera access is turned off by a profile or Screen Time policy on this device, "
        + "so a receipt can't be photographed here."
    /// Also what the Simulator reaches, where there is no camera to open.
    internal static let cameraUnavailable =
        "This device has no camera, so a receipt can't be photographed here."
    internal static let openSettings = "Open Settings"

    // MARK: capture problems

    /// One sentence per ``ReceiptCaptureProblem``, each ending in what to do
    /// next — none of these are states a person can be left sitting in.
    internal static func message(for problem: ReceiptCaptureProblem) -> String {
        switch problem {
        case .cameraFailed:
            return "The camera stopped before the receipt was captured. Try again."
        case .noPages:
            return "No photos came back from that scan. Try again."
        case .unpreparedPages:
            return
                "One of those photos couldn't be prepared, and a receipt missing a page "
                + "would be read wrong. Photograph the whole receipt again."
        case .tooManyPages(let count):
            return
                "That's \(count) photos, and a receipt can be sent as at most "
                + "\(ReceiptPart.maxPerReceipt). Photograph it again in fewer, larger pieces."
        }
    }
}

/// Every word the result screen shows.
///
/// Kept apart from ``ReceiptCaptureCopy`` because the two describe different
/// screens: this one is read from a ``ReceiptOutcome`` the server produced,
/// the other from what the camera and the person in front of it did.
internal enum ReceiptResultCopy {
    internal static let submitting = "Reading your receipt…"
    internal static let retry = "Retry"

    // MARK: created

    internal static let createdHeading = "Receipt saved"
    internal static let createdMessage = "The purchase has been recorded."
    /// Distinct from ``createdMessage`` for the case the ticket names
    /// explicitly: a re-upload of bytes already on file is not a duplicate
    /// purchase, and telling somebody it saved twice would be a lie about
    /// their money.
    internal static let createdAlreadyStoredMessage =
        "This receipt was already on file — nothing new was recorded."
    internal static func purchaseReference(_ purchaseId: String) -> String {
        "Reference \(purchaseId)"
    }
    /// A known gap said out loud rather than hidden: nothing in this app shows
    /// a purchase once it exists, so there is no screen to send anybody to.
    internal static let createdNoDestination =
        "There's nowhere in the app yet to view this purchase."

    // MARK: needs review

    internal static let needsReviewHeading = "Needs a closer look"
    internal static let needsReviewMessage =
        "The numbers on this receipt don't add up to its printed total, "
        + "so nothing was recorded. Enter it manually, or retake the photo "
        + "and try again."
    internal static let needsReviewWhatWeRead = "What was read"
    internal static let needsReviewWhatFailed = "Why it needs review"

    /// The labels on the table under ``needsReviewWhatWeRead``. Nested rather
    /// than prefixed so the set reads as one table, matching
    /// `TransactionsCopy.FieldLabel`.
    internal enum FieldLabel {
        internal static let merchant = "Merchant"
        internal static let address = "Address"
        internal static let date = "Date"
        internal static let total = "Total"
        internal static let tax = "Tax"
        internal static let discounts = "Discounts"
        internal static let surcharges = "Surcharges"
        internal static let shipping = "Shipping"
        internal static let lines = "Items"
        internal static let unreadableNotes = "Could not be read"
    }

    // MARK: unreadable

    internal static let unreadableHeading = "Couldn't read this receipt"
    internal static let unreadableMessage =
        "Retake the photo — a flatter angle or better light usually fixes this."
    internal static func unreadableReason(_ reason: String) -> String {
        "Details: \(reason)"
    }

    // MARK: photo count

    internal static func photoCount(_ count: Int) -> String {
        count == 1 ? "From 1 photo." : "From \(count) photos."
    }

    // MARK: gate failures

    /// One line per ``ReceiptGateFailureKind``, in the receipt's own terms —
    /// mirroring the closed list the purchases pillar's gate can fail on.
    internal static func gateFailureLabel(_ kind: ReceiptGateFailureKind) -> String {
        switch kind {
        case .unreadableTotal:
            return "The printed total could not be read."
        case .unreadableLine:
            return "A line item could not be read."
        case .noLines:
            return "No line items could be read."
        case .negativeLine:
            return "A line item read as a negative amount."
        case .sumMismatch:
            return "The line items don't add up to the printed total."
        case .damaged:
            return "The receipt looks damaged or unclear."
        }
    }

    /// Cents formatted with a sign, for ``ReceiptGateFailureKind/sumMismatch``.
    /// Cents rather than a currency symbol — the receipt's currency is a
    /// best-effort read, not a fact this screen should dress an amount up
    /// with.
    internal static func deltaCents(_ deltaCents: Int) -> String {
        let magnitude = String(format: "%.2f", abs(Double(deltaCents)) / 100)
        return deltaCents < 0 ? "\(magnitude) short of the total" : "\(magnitude) over the total"
    }

    // MARK: gateway failures

    /// One sentence per ``RepositoryError``, matching `TransactionsCopy`'s
    /// pattern: every failure this screen can reach gets its own sentence
    /// rather than one line covering all of them.
    internal static func message(for error: RepositoryError) -> String {
        switch error {
        case .unavailable:
            return
                "Receipts are temporarily unreachable. "
                + "Nothing was recorded — try again in a moment."
        case .unauthorized:
            return "This device is no longer signed in."
        case .contractMismatch:
            return "This version of Pops cannot read what the server sent. Update the app."
        case .transport:
            return "Could not reach the server. Check your connection and try again."
        case .dependencyNotBound:
            return "Pops is not set up correctly on this device."
        }
    }
}
