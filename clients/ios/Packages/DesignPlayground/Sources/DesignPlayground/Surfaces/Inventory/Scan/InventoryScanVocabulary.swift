/// The four ways a phone can refuse to open the camera, the same shape every
/// camera-using pillar survives, kept local to Inventory rather than shared
/// with Receipts: the concept is the same, but coupling this surface to
/// `FeatureReceiptCapture`'s own type would make Inventory scan a client of
/// a feature it has nothing to do with.
internal enum InventoryScanAccess: CaseIterable, Equatable {
    case authorized
    case undetermined
    case denied
    case restricted
    case unavailable
}

/// What happened after a code was read: something Inventory owns, something
/// another pillar owns, or something wrong with the code itself.
///
/// QR is shared POPS routing (the ticket's done-when), so
/// ``otherPillar(name:)`` is a real, successful outcome, and only
/// ``malformed`` is a failure to parse.
internal enum InventoryScanOutcome: Equatable {
    case recognized(InventoryDeepLink)
    case malformed

    internal var bannerMessage: String {
        switch self {
        case .recognized(.otherPillar(let name)):
            return "This is a \(name.capitalized) code. Inventory does not open it here."
        case .recognized(.item), .recognized(.container), .recognized(.location):
            return "Found."
        case .recognized(.malformed), .malformed:
            return "This code is not a POPS label. Try lining it up again."
        }
    }
}
