import FeatureReceiptCapture

/// Merchants the review form's picker can offer, and the addresses each is
/// known at.
///
/// A stand-in for a contacts lookup the phone cannot make: bfm proxies no
/// contacts routes, so no device has ever received this list. POPS-3650 is the
/// route; this is what the picker looks like once it exists.
///
/// The names are the entity's, not the till's — `Bunnings`, not
/// `BUNNINGS WAREHOUSE ALEXANDRIA` — because that is the half worth reading
/// and the distinction POPS-3634 exists to carry. Two of them have several
/// branches, one has a single branch, and one has none at all: an entity with
/// no address on file is ordinary, and the picker has to fall back to a field
/// rather than offering an empty list.
internal enum PurchaseMerchantFixtures {
    internal static let all: [ReceiptMerchantChoice] = [
        ReceiptMerchantChoice(
            id: "ent-bunnings",
            name: "Bunnings",
            addresses: [
                "8 Bourke Road, Alexandria NSW",
                "9 Parramatta Road, Ashfield NSW",
            ]),
        ReceiptMerchantChoice(
            id: "ent-woolworths",
            name: "Woolworths",
            addresses: [
                "412 Crown Street, Surry Hills NSW",
                "Town Hall Square, Sydney NSW",
                "1 Broadway, Ultimo NSW",
            ]),
        ReceiptMerchantChoice(
            id: "ent-kmart",
            name: "Kmart",
            addresses: ["1 Bay Street, Broadway NSW"]),
        ReceiptMerchantChoice(
            id: "ent-uniqlo",
            name: "Uniqlo",
            addresses: []),
    ]
}
