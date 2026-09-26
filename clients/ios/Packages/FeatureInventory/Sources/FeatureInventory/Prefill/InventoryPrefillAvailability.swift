import Observation

#if canImport(FoundationModels)
    import FoundationModels
#endif

@MainActor @Observable
internal final class InventoryPrefillAvailability {
    internal private(set) var isAvailable: Bool

    private let read: @MainActor () -> Bool

    internal init(read: @escaping @MainActor () -> Bool) {
        self.read = read
        isAvailable = read()
        observe()
    }

    internal static func system() -> InventoryPrefillAvailability {
        #if canImport(FoundationModels)
            if #available(iOS 26.4, macOS 26.4, *) {
                return InventoryPrefillAvailability {
                    SystemLanguageModel.default.availability == .available
                }
            }
        #endif
        return InventoryPrefillAvailability { false }
    }

    private func observe() {
        withObservationTracking {
            _ = read()
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                self?.refresh()
            }
        }
    }

    private func refresh() {
        isAvailable = read()
        observe()
    }
}
