import AppCore

/// A deterministic barcode lookup that records codes and returns a scripted result.
public actor FakeInventoryBarcodeLookupService: InventoryBarcodeLookupService {
    /// Codes received by the service, in call order.
    public private(set) var codes: [String] = []

    private var result: InventoryBarcodeLookup

    /// Creates a lookup with the result returned by every call.
    public init(result: InventoryBarcodeLookup = .unavailable) {
        self.result = result
    }

    /// Changes the result returned by subsequent calls.
    public func setResult(_ result: InventoryBarcodeLookup) {
        self.result = result
    }

    /// Records the code and returns the current scripted result.
    public func lookUp(code: String) async throws -> InventoryBarcodeLookup {
        codes.append(code)
        return result
    }
}
