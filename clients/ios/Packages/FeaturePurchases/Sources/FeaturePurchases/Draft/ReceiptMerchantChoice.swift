/// A merchant the reader can pick.
///
/// The point of picking rather than typing is ``id``. `merchantEntityId` is
/// operative data in `purchases` — a wrong one silently files somebody else's
/// spending — and a form that only ever produced a label could never attach
/// one, which is how every purchase captured on a phone ends up unattributed.
///
/// An empty catalogue is an ordinary case rather than a degraded one — a
/// device that cannot reach contacts, or a first run. What it is *not* is a
/// licence to type a merchant as free text: the form offers creating one
/// instead, because the operative field is an id and a name with nothing
/// behind it is a purchase attributed to nobody.
public struct ReceiptMerchantChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String

    /// Creates a selectable merchant identity.
    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// One branch on a merchant's record.
///
/// Identified, not a string. Contacts owns the list, so a purchase points at
/// one of them the way it points at the entity itself — which is what lets a
/// branch be spelled once rather than differently on every receipt that
/// mentions it.
public struct ReceiptAddressChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let value: String

    /// Creates a selectable merchant-address identity.
    public init(id: String, value: String) {
        self.id = id
        self.value = value
    }
}

/// Searches merchant choices by reader-entered text.
public typealias ReceiptMerchantSearch = (String) async -> [ReceiptMerchantChoice]

/// Resolves one merchant choice for an existing identifier.
public typealias ReceiptMerchantPreview = (String) async -> ReceiptMerchantChoice?

/// Lists the address choices belonging to one merchant identifier.
public typealias ReceiptAddressesForMerchant = (String) async -> [ReceiptAddressChoice]

/// Resolves one existing address within its merchant.
public typealias ReceiptAddressPreview = (String, String) async -> ReceiptAddressChoice?
