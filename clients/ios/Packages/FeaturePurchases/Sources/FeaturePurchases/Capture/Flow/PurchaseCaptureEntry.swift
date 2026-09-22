import SwiftUI

/// Values used by a host to open purchase capture without owning its flow.
public enum PurchaseCaptureEntry {
    /// The four supported ways to begin capturing a purchase.
    public enum Source: String, CaseIterable, Identifiable, Sendable {
        /// Opens the document scanner.
        case scan
        /// Opens the photo picker.
        case photos
        /// Opens the file picker.
        case file
        /// Opens a blank hand-entry form.
        case hand

        /// Sources offered by an Add menu; scanning has its own adjacent control.
        public static let added: [Source] = [.photos, .file, .hand]

        /// The stable source identifier.
        public var id: String { rawValue }

        /// The action title shown by a capture control.
        public var title: String {
            switch self {
            case .scan: "Scan a receipt"
            case .photos: "Choose photos"
            case .file: "Choose a file"
            case .hand: "Enter it by hand"
            }
        }

        /// The SF Symbol paired with the source title.
        public var symbol: String {
            switch self {
            case .scan: "doc.viewfinder"
            case .photos: "photo.on.rectangle"
            case .file: "folder"
            case .hand: "square.and.pencil"
            }
        }

        /// The stable identifier for UI automation and accessibility lookup.
        public var accessibilityIdentifier: String {
            "purchase-capture-\(rawValue)"
        }
    }
}

/// A host-owned presentation action for the purchase capture flow.
///
/// The host reports a completed run once with every saved purchase identifier in save order.
/// Cancelling after a partial save still reports those identifiers; a run that saved nothing does
/// not report completion.
public struct PurchaseCapturePresenter: Sendable {
    private let present: @MainActor @Sendable (PurchaseCaptureEntry.Source) -> Void

    /// Creates a presenter that opens capture at `source`.
    public init(_ present: @escaping @MainActor @Sendable (PurchaseCaptureEntry.Source) -> Void) {
        self.present = present
    }

    /// Opens the host's capture flow at the selected source.
    @MainActor public func callAsFunction(_ source: PurchaseCaptureEntry.Source) {
        present(source)
    }
}

extension EnvironmentValues {
    /// The host capture presenter, or `nil` when purchase capture is unavailable.
    @Entry public var purchaseCapture: PurchaseCapturePresenter? = nil
}
