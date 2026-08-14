/// What the purchases pillar's gate objected to, in the receipt's own terms —
/// mirroring `GateFailureSchema`'s closed `kind` list.
public enum ReceiptGateFailureKind: String, Hashable, Sendable {
    case unreadableTotal = "unreadable-total"
    case unreadableLine = "unreadable-line"
    case noLines = "no-lines"
    case negativeLine = "negative-line"
    case sumMismatch = "sum-mismatch"
    case damaged
}

/// One thing the gate objected to.
public struct ReceiptGateFailure: Hashable, Sendable {
    public let kind: ReceiptGateFailureKind
    public let detail: String
    /// How far the receipt's own arithmetic falls from the total it states,
    /// present only on ``ReceiptGateFailureKind/sumMismatch``. Negative means
    /// the components fall short of the stated total.
    public let deltaCents: Int?

    public init(kind: ReceiptGateFailureKind, detail: String, deltaCents: Int?) {
        self.kind = kind
        self.detail = detail
        self.deltaCents = deltaCents
    }
}
