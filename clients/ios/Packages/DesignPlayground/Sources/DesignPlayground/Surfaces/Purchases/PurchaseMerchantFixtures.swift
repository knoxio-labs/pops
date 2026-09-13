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
/// and the distinction POPS-3634 exists to carry.
///
/// A dozen rather than four, because the list is meant to be searched: at
/// three entries a search field is decoration, and the whole reason the picker
/// is a sheet is that there will be hundreds. Several have multiple branches,
/// several have exactly one, and three have none at all — an entity with no
/// address on file is ordinary, and the select has to offer creating one
/// rather than an empty list.
internal enum PurchaseMerchantFixtures {
    internal static let all: [ReceiptMerchantChoice] = [
        merchant(
            "bunnings", "Bunnings",
            ["8 Bourke Road, Alexandria NSW", "9 Parramatta Road, Ashfield NSW"]),
        merchant(
            "woolworths", "Woolworths",
            [
                "412 Crown Street, Surry Hills NSW",
                "Town Hall Square, Sydney NSW",
                "1 Broadway, Ultimo NSW",
            ]),
        merchant("kmart", "Kmart", ["1 Bay Street, Broadway NSW"]),
        merchant("uniqlo", "Uniqlo", []),
        merchant("aldi", "ALDI", ["Level 1, 500 Oxford Street, Bondi Junction NSW"]),
        merchant("chemist", "Chemist Warehouse", ["195 Broadway, Ultimo NSW"]),
        merchant("salvos", "Salvos Stores", ["2 Denison Street, Bondi Junction NSW"]),
        merchant("sushi", "Monster Sushi", ["Barrack Place, 151 Clarence Street, Sydney NSW"]),
        merchant("tongli", "Tongli Supermarket", ["Level 1, 80 Hay Street, Haymarket NSW"]),
        merchant("backblaze", "Backblaze", []),
        merchant("transportnsw", "Transport for NSW", []),
        merchant("eveleigh", "Eveleigh Farmers Market", ["243 Wilson Street, Eveleigh NSW"]),
    ]

    private static func merchant(
        _ slug: String, _ name: String, _ addresses: [String]
    ) -> ReceiptMerchantChoice {
        ReceiptMerchantChoice(
            id: "ent-\(slug)",
            name: name,
            addresses: addresses.enumerated().map { index, value in
                ReceiptAddressChoice(id: "adr-\(slug)-\(index)", value: value)
            })
    }
}
