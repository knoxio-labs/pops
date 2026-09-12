/// A merchant the reader can pick, and the addresses it is known at.
///
/// The point of picking rather than typing is ``id``. `merchantEntityId` is
/// operative data in `purchases` — a wrong one silently files somebody else's
/// spending — and a form that only ever produced a label could never attach
/// one, which is how every purchase captured on a phone ends up unattributed.
///
/// The addresses come with the merchant because they are the merchant's:
/// contacts owns the entity and the entity owns a list of branches. A shop has
/// a handful, and typing the street each time produces a different spelling
/// each time.
///
/// An empty catalogue is an ordinary case rather than a degraded one — a
/// device that cannot reach contacts, or a first run. What it is *not* is a
/// licence to type a merchant as free text: the form offers creating one
/// instead, because the operative field is an id and a name with nothing
/// behind it is a purchase attributed to nobody.
public struct ReceiptMerchantChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let addresses: [ReceiptAddressChoice]

    public init(id: String, name: String, addresses: [ReceiptAddressChoice]) {
        self.id = id
        self.name = name
        self.addresses = addresses
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

    public init(id: String, value: String) {
        self.id = id
        self.value = value
    }
}
