/// What the purchases pillar's gate objected to, in the receipt's own terms.
///
/// Open rather than closed, and that is the whole design. The BFM keeps the
/// wire's `code` an open string on purpose — a gate that grows a reason must
/// not stop an installed build reading an outcome — and a closed enum here
/// would take that back: a code outside the list would sink the whole
/// needs-review answer on hardware nobody can roll forward (ADR-043). The
/// named cases are the ones this build has written copy for;
/// ``unrecognised(_:)`` is every later one, and it still renders, because the
/// producer's own `detail` says what happened either way.
public enum ReceiptGateFailureKind: Hashable, Sendable {
    case unreadableTotal
    case unreadableLine
    case noLines
    case negativeLine
    case sumMismatch
    /// The receipt's arithmetic works out under two different tax readings, so
    /// which one it printed cannot be told from the paper.
    case ambiguousTax
    case damaged
    /// A kind the gate grew after this build shipped, carried verbatim.
    case unrecognised(String)

    /// The producer's own wire code for this kind.
    public var wireCode: String {
        switch self {
        case .unreadableTotal: "unreadable-total"
        case .unreadableLine: "unreadable-line"
        case .noLines: "no-lines"
        case .negativeLine: "negative-line"
        case .sumMismatch: "sum-mismatch"
        case .ambiguousTax: "ambiguous-tax"
        case .damaged: "damaged"
        case .unrecognised(let code): code
        }
    }

    public init(wireCode: String) {
        switch wireCode {
        case "unreadable-total": self = .unreadableTotal
        case "unreadable-line": self = .unreadableLine
        case "no-lines": self = .noLines
        case "negative-line": self = .negativeLine
        case "sum-mismatch": self = .sumMismatch
        case "ambiguous-tax": self = .ambiguousTax
        case "damaged": self = .damaged
        default: self = .unrecognised(wireCode)
        }
    }
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
