import Foundation

/// Where a purchase stands against the money that paid for it.
///
/// The mobile surface sends this as a bare string rather than an enumeration,
/// deliberately: a status added to the purchases pillar would otherwise turn
/// every handset older than that deploy into a contract mismatch, and a list
/// that refuses to draw is a worse answer than a row whose badge says nothing.
/// ``unrecognised`` is that openness made explicit rather than left implicit in
/// a `String`.
public enum PurchaseSettlement: Hashable, Sendable {
    /// Nothing in finance explains this purchase yet.
    case awaitingSettlement
    /// A finance transaction accounts for it.
    case linked
    /// Some of it is accounted for and some is not.
    case partial
    /// Paid in cash, so no transaction will ever explain it. A terminal state,
    /// not a pending one.
    case settledCash
    /// Deliberately excluded from reconciliation.
    case ignored
    /// A status this build has never heard of, kept verbatim.
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "awaiting_settlement": self = .awaitingSettlement
        case "linked": self = .linked
        case "partial": self = .partial
        case "settled_cash": self = .settledCash
        case "ignored": self = .ignored
        default: self = .unrecognised(wire)
        }
    }

    /// Whether the purchase is still waiting on somebody. `settledCash` and
    /// `ignored` are settled answers rather than pending ones, and an
    /// unrecognised status is not claimed either way.
    public var isUnsettled: Bool {
        switch self {
        case .awaitingSettlement, .partial: true
        case .linked, .settledCash, .ignored, .unrecognised: false
        }
    }
}

/// Who a purchase was made from, and how sure the pillar is about it.
///
/// Three cases because the purchases pillar draws three, and collapsing them
/// to `String?` loses the one distinction that matters: `merchantEntityName`
/// is **always the receipt's own wording**, printed by a till, kept verbatim
/// even when the entity resolves — `pillars/purchases/src/api/contacts/
/// merchant.ts` says so, and refuses to fuzzy-match precisely because
/// `merchantEntityId` is operative data and a wrong one silently files
/// somebody else's spending.
///
/// So a resolved merchant has two names: the till's and the entity's. The
/// entity's is the one worth reading. The till's is the one worth searching.
public enum MerchantIdentity: Hashable, Sendable {
    /// Matched to a contacts entity. `name` is that entity's name — the one a
    /// person would recognise — and `printed` is what the receipt said.
    case entity(id: String, name: String, printed: String)
    /// The receipt's wording, matched to nothing. Shown as printed: there is
    /// no tidier name to show, and inventing one by title-casing it would be
    /// this app having an opinion about a label the pillar is searched by.
    case printed(String)
    /// The pillar read no merchant at all.
    case unattributed

    /// What to put on screen.
    public var displayName: String? {
        switch self {
        case .entity(_, let name, _): name
        case .printed(let printed): printed
        case .unattributed: nil
        }
    }

    /// Whether the name on screen is a label nothing has confirmed. The web
    /// playground draws the same distinction as an attribution legend; a row
    /// is the phone's version of it.
    public var isUnverified: Bool {
        switch self {
        case .entity: false
        case .printed, .unattributed: true
        }
    }
}

/// One purchase in the mobile list.
public struct Purchase: Hashable, Sendable, Identifiable {
    public let id: String
    public let merchant: MerchantIdentity
    public let orderedOn: Date
    public let total: MoneyAmount
    public let itemCount: Int
    public let receiptURI: String?
    public let status: PurchaseSettlement

    public init(
        id: String,
        merchant: MerchantIdentity,
        orderedOn: Date,
        total: MoneyAmount,
        itemCount: Int,
        receiptURI: String?,
        status: PurchaseSettlement
    ) {
        self.id = id
        self.merchant = merchant
        self.orderedOn = orderedOn
        self.total = total
        self.itemCount = itemCount
        self.receiptURI = receiptURI
        self.status = status
    }
}

/// One cursor-paginated page of purchases.
public struct PurchasePage: Hashable, Sendable {
    public let purchases: [Purchase]
    public let nextCursor: String?

    public init(purchases: [Purchase], nextCursor: String?) {
        self.purchases = purchases
        self.nextCursor = nextCursor
    }
}
