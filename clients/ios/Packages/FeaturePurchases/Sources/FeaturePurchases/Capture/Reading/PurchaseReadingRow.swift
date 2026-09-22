import AppCore

/// One staged receipt converted into the payload a reading operation consumes.
///
/// This value deliberately omits staging layout. The staging model converts each ordered receipt
/// into ordered parts before reading begins, so later page rearrangements cannot mutate a request
/// already in flight.
public struct StagedReceiptForReading: Identifiable, Sendable {
    /// The staged receipt identity retained through reading and review.
    public let id: String
    /// The receipt parts in page order.
    public let parts: [ReceiptPart]

    /// Creates a reading input from one staged receipt.
    public init(id: String, parts: [ReceiptPart]) {
        self.id = id
        self.parts = parts
    }
}

/// One receipt's progress and result while a staged batch is being read.
public struct PurchaseReadingRow: Identifiable, Hashable, Sendable {
    /// The staged receipt identity.
    public let id: String
    /// The receipt parts in page order.
    public let parts: [ReceiptPart]
    /// The current reading outcome.
    public var outcome: Outcome

    /// Creates a row for a staged receipt and its current outcome.
    public init(id: String, parts: [ReceiptPart], outcome: Outcome) {
        self.id = id
        self.parts = parts
        self.outcome = outcome
    }

    /// The distinct states of one receipt-reading operation.
    ///
    /// A successful result retains the full editable reading so review can derive presentation
    /// without storing a second projection of the same receipt.
    public enum Outcome: Hashable, Sendable {
        /// Waiting for its reading operation to start.
        case queued
        /// A reading operation is in flight.
        case reading
        /// Reading produced an editable receipt result.
        case read(ReceiptDraftReading)
        /// Reading could not produce an editable receipt.
        case unreadable(reason: String)

        /// Whether reading has finished with either a result or a terminal failure.
        public var isSettled: Bool {
            switch self {
            case .queued, .reading: false
            case .read, .unreadable: true
            }
        }
    }
}
