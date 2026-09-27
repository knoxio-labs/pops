import AppCore

internal enum InventoryPrefillStatus: Equatable, Sendable {
    case running
    case nothingFound
    case productNotFound
    case barcodeUnsupported
    case lookupFailed(PopsError)
    case noText
    case scannerUnavailable
    case cameraDenied

    internal var message: String {
        switch self {
        case .running: "Filling fields…"
        case .nothingFound: "Nothing on it matched this type's fields"
        case .productNotFound: "No product found for this barcode"
        case .barcodeUnsupported: "Barcode lookup covers books. Use text for this item."
        case .lookupFailed(let error): error.message
        case .noText: "No text recognised"
        case .scannerUnavailable: "Scanning isn't available on this device"
        case .cameraDenied: "Camera access is off for Pops"
        }
    }
}
