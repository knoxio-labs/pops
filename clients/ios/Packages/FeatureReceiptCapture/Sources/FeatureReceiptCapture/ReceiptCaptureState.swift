import AppCore
import Foundation

/// One receipt's photographs, ready to send.
///
/// The identity is not decoration. A second receipt captured without leaving
/// this screen has to reach the result screen as a *different* screen — same
/// view, new model, new call — and SwiftUI decides that from view identity
/// rather than from the value it is handed.
public struct ReceiptSubmission: Identifiable, Hashable, Sendable {
    public let id: UUID
    /// In order, top to bottom, as ``ReceiptPart`` documents.
    public let parts: [ReceiptPart]

    public init(id: UUID = UUID(), parts: [ReceiptPart]) {
        self.id = id
        self.parts = parts
    }
}

/// What the capture screen is showing.
///
/// Two states, not three: there is no "photographing" state here because the
/// document camera is a modal presentation the system owns, and while it is up
/// this screen is not the one being looked at. Whether that presentation is on
/// screen is a separate flag for exactly that reason — it says what is covering
/// this screen, not what this screen is.
public enum ReceiptCaptureState: Hashable, Sendable {
    /// Nothing captured yet, or the last capture was handed off and the person
    /// came back for another receipt.
    case ready
    /// A receipt was captured and the result screen owns it from here.
    case reading(ReceiptSubmission)
}

/// Why a capture produced no receipt to send.
///
/// Separate from `RepositoryError`, which is the upload's vocabulary: nothing
/// here ever reached the network, and telling somebody the server is
/// unreachable because their scan came back empty would send them to fix the
/// wrong thing.
public enum ReceiptCaptureProblem: Hashable, Sendable {
    /// The document camera reported a failure instead of a scan.
    case cameraFailed
    /// It finished with no pages at all.
    case noPages
    /// Pages were photographed and at least one could not be turned into bytes
    /// to send. Refused whole rather than sent short — a receipt missing a page
    /// still adds up to a total, just not to the one printed on the paper, and
    /// the reading that came back would be wrong in a way nobody could see.
    case unpreparedPages
    /// More pages than one receipt may be sent as. Carries the count, because
    /// "you took eleven" is what makes the limit actionable.
    case tooManyPages(Int)
}
