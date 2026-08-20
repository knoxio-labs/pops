import AppCore
import Foundation

/// Every word this module shows, in one place — matching `FeatureTransactions`
/// and `FeaturePairing`: the app has no localisation layer, and copy
/// scattered through a view makes adding one a hunt.
internal enum ReceiptCaptureCopy {
    /// The tab's own name rather than a description of the button under it.
    /// A screen titled after its one control tells a reader what will happen
    /// when they press it and nothing about where they are.
    internal static let title = "Receipts"
    internal static let instruction =
        "Photograph a receipt and it's read into a purchase — merchant, items and total."
    internal static let captureButton = "Photograph a receipt"
    internal static let captureAnother = "Photograph another receipt"

    // MARK: getting a readable photograph

    /// What actually decides whether the reading comes back usable, said
    /// before the photograph rather than after it fails.
    ///
    /// Three, and no more: this is the screen's second-most-important content
    /// and a list long enough to scroll is one nobody reads. Each is paired
    /// with a glyph in ``ReceiptCapturePrompt`` — the symbol names live there
    /// because they are pictures rather than words.
    internal static let guidanceTitle = "For a clean read"
    internal static let guidanceFlat = "Lay it flat and fill the frame."
    internal static let guidanceLight = "Even light, no shadow across the print."
    internal static let guidanceLongReceipt =
        "A long receipt is several photos, top to bottom — they're read as one."

    // MARK: camera refusals

    /// Undoable from Settings, so this is the only one offered a link.
    internal static let cameraDeniedTitle = "Camera access is off"
    internal static let cameraDenied =
        "Pops can't use the camera. Allow camera access in Settings to photograph a receipt."
    internal static let cameraRestrictedTitle = "Camera access is managed"
    internal static let cameraRestricted =
        "Camera access is turned off by a profile or Screen Time policy on this device, "
        + "so a receipt can't be photographed here."
    /// Also what the Simulator reaches, where there is no camera to open.
    internal static let cameraUnavailableTitle = "No camera on this device"
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

    /// The heading over the photographs themselves. They sit above every
    /// outcome, because the paper is the thing all three are about and only
    /// the commentary underneath changes.
    internal static let capturedPages = "What you photographed"
    /// What VoiceOver calls one page of a scan. The pages are the same object
    /// in every outcome, so the label is too.
    internal static func page(_ index: Int, of total: Int) -> String {
        total == 1 ? "Photo of the receipt" : "Photo \(index) of \(total)"
    }

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
    /// What was recorded, as a reader checks it against the paper still in
    /// their hand: merchant, how many items, what it cost. A merchant the
    /// pillar could not resolve is left out rather than filled with a
    /// placeholder — the item count and the total are still checkable, and a
    /// "Unknown merchant" line is a claim about the receipt that nobody made.
    internal static func purchaseSummary(
        merchantName: String?, itemCount: Int, total: String
    ) -> String {
        [merchantName, itemCountLabel(itemCount), total]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
    /// Omitted entirely at zero: "0 items" beside a total reads as a receipt
    /// that recorded nothing, when what happened is that the reading found no
    /// separate lines.
    ///
    /// `internal` because the confirmation card draws it on a line of its own
    /// as well as inside ``purchaseSummary(merchantName:itemCount:total:)`` —
    /// the summary is what VoiceOver reads as one sentence, the separate lines
    /// are what a sighted reader scans, and both have to say the same thing.
    internal static func itemCountLabel(_ itemCount: Int) -> String? {
        switch itemCount {
        case ..<1: nil
        case 1: "1 item"
        default: "\(itemCount) items"
        }
    }

    /// The label beside the figure on the confirmation card. Named rather
    /// than reusing ``FieldLabel/total``: that set describes a *reading* the
    /// gate refused, and this one describes a purchase that was written.
    internal static let createdTotalLabel = "Total"
    internal static func purchasedOn(_ formattedDate: String) -> String {
        "Dated \(formattedDate)"
    }

    // MARK: needs review

    internal static let needsReviewHeading = "Needs a closer look"
    internal static let needsReviewMessage =
        "The numbers on this receipt don't add up to its printed total, "
        + "so nothing was recorded. Enter it manually, or retake the photo "
        + "and try again."
    internal static let needsReviewWhatWeRead = "What was read"
    internal static let needsReviewWhatFailed = "Why it needs review"

    /// How a line item's quantity and unit note are folded into one aside
    /// beside the amount, so the description column stays a column.
    internal static func lineNote(quantity: Int?, unitNote: String?) -> String? {
        let parts =
            [
                quantity.map { "×\($0)" },
                unitNote?.trimmingCharacters(in: .whitespacesAndNewlines),
            ]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

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

    /// One line per ``ReceiptGateFailureKind``, in the receipt's own terms.
    ///
    /// ``ReceiptGateFailureKind/unrecognised(_:)`` gets a generic sentence
    /// rather than the raw wire code: the gate's own `detail` is drawn beside
    /// this and says what actually happened, and showing a reader
    /// `negative-shipping` teaches them the producer's vocabulary instead of
    /// telling them about their receipt.
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
        case .ambiguousTax:
            return "It's unclear whether the prices include tax."
        case .damaged:
            return "The receipt looks damaged or unclear."
        case .unrecognised:
            return "Something on this receipt didn't check out."
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
