/// A merchant the reader can pick, and the addresses it is known at.
///
/// The point of picking rather than typing is ``id``. `merchantEntityId` is
/// operative data in `purchases` — a wrong one silently files somebody else's
/// spending — and a form that only ever produced a label could never attach
/// one, which is how every purchase captured on a phone ends up unattributed.
///
/// The addresses come with the merchant because they are the merchant's. A
/// shop has a handful of branches, and typing the street each time produces a
/// different spelling each time; offered as a list they stay one place.
///
/// An empty catalogue is an ordinary case, not a degraded one: the form falls
/// back to free text, which is exactly what it did before pickers existed and
/// exactly what it must still do on a device that cannot reach contacts.
public struct ReceiptMerchantChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let addresses: [String]

    public init(id: String, name: String, addresses: [String]) {
        self.id = id
        self.name = name
        self.addresses = addresses
    }
}
