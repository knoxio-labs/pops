/// An account's kind, mirroring the finance pillar's vocabulary.
///
/// Deliberately not an `enum`, for the same reason as ``TransactionType``: this
/// app is distributed rather than deployed, so a build already on a phone meets
/// contract versions written after it. A raw-value wrapper carries a kind this
/// build has never heard of through to the screen instead of failing to decode
/// it, and ``AccountSide/asset`` is the fallback a screen falls back to for one.
public struct AccountKind: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let checking = AccountKind(rawValue: "checking")
    public static let savings = AccountKind(rawValue: "savings")
    public static let creditCard = AccountKind(rawValue: "credit-card")
    public static let cash = AccountKind(rawValue: "cash")
    public static let giftCard = AccountKind(rawValue: "gift-card")
    public static let person = AccountKind(rawValue: "person")
    public static let shared = AccountKind(rawValue: "shared")
    public static let loan = AccountKind(rawValue: "loan")
    public static let novatedLease = AccountKind(rawValue: "novated-lease")
    public static let crypto = AccountKind(rawValue: "crypto")
    public static let other = AccountKind(rawValue: "other")
}

/// The sign convention a kind implies, mirroring the finance pillar's own
/// `AccountSide`. An asset's positive balance is money held; a liability's is
/// money owed. ``either`` is the person ledger, where the sign says which way
/// the debt runs and neither reading is the default.
public enum AccountSide: Hashable, Sendable {
    case asset
    case liability
    case either
}

extension AccountKind {
    /// The sign convention this kind reads under.
    ///
    /// A kind this build has never heard of reads as ``AccountSide/asset`` —
    /// the reading that treats a positive balance as money held, which is the
    /// common case and the one that fails safe: a ledger the app cannot
    /// classify still shows a positive number in the tone that means "yours",
    /// rather than guessing it is owed.
    public var side: AccountSide {
        switch self {
        case .creditCard, .loan, .novatedLease: .liability
        case .person: .either
        default: .asset
        }
    }

    /// Whether an external balance exists to checkpoint against, as opposed to
    /// one this app can only ever derive from the transactions it has seen.
    public var isCheckpointable: Bool {
        switch self {
        case .cash, .giftCard, .person: false
        default: true
        }
    }

    /// Whether this kind's balance is money loaded up front and spent down,
    /// rather than money moving in either direction.
    public var isStoredValue: Bool {
        self == .giftCard
    }
}
