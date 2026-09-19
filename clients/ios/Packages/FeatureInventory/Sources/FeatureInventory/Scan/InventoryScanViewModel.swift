import AppCore
import Foundation
import Observation

/// The scan screen's whole decision surface (POPS-4078, POPS-4108).
///
/// Camera permission, decoding and resolution are all read through seams —
/// ``CameraAuthorizing`` and ``InventoryStore`` — so a test drives every
/// approved phase without a real camera. Decoding a `pops://` reference and
/// dispatching it is not reimplemented here: it is handed to the same
/// ``EntityRouter`` the `pops` URL scheme resolves through, so a label opens
/// the same destination whichever path found it.
@MainActor
@Observable
internal final class InventoryScanViewModel {
    internal private(set) var phase: InventoryScanPhase = .scanning
    internal private(set) var cameraAccess: CameraAccess = .notDetermined
    /// Set once a `pops://` reference has been handed to the router and it
    /// answered `.handled` — an inventory item or location, which the
    /// composition root is already showing elsewhere. The screen watches
    /// this and dismisses itself, the same way it would have nothing left to
    /// show had the code been opened as a link instead of scanned.
    internal private(set) var didRouteElsewhere = false

    /// The in-flight code lookup, exposed so a test can await it instead of
    /// polling ``phase``.
    internal private(set) var pendingLookup: Task<Void, Never>?

    private let store: any InventoryStore
    private let router: any EntityRouter
    private let camera: any CameraAuthorizing

    internal init(
        store: any InventoryStore,
        router: any EntityRouter,
        camera: any CameraAuthorizing = SystemCameraAuthorization()
    ) {
        self.store = store
        self.router = router
        self.camera = camera
    }

    /// Prompts if nobody has been asked, and opens the camera only if the
    /// answer is yes — the same shape `PairingViewModel.scanQRCode()` uses,
    /// so a refusal is a state the screen renders rather than a camera
    /// preview showing black.
    internal func start() async {
        cameraAccess = await camera.requestAccess()
        phase = cameraAccess == .authorized ? .scanning : .denied
    }

    /// Reads the standing decision without prompting, for a return from
    /// Settings to pick up without relaunching.
    internal func refreshCameraAccess() {
        cameraAccess = camera.currentAccess()
        if cameraAccess == .authorized, phase == .denied {
            phase = .scanning
        }
    }

    /// Consumes a decoded payload.
    ///
    /// - Returns: Whether the camera should stop. Unlike the pairing
    ///   scanner, which silently ignores a code that is not a pairing link so
    ///   scanning keeps going behind a form that is always on screen, this
    ///   screen has nothing else to show underneath — every decode is
    ///   meaningful enough to answer, so this always returns `true` once
    ///   scanning is in progress.
    @discardableResult
    internal func didScan(_ payload: String) -> Bool {
        guard phase == .scanning else { return false }

        if let uri = parsePopsURI(payload) {
            route(uri)
            return true
        }
        guard !payload.hasPrefix("pops://") else {
            phase = .notPops
            return true
        }
        lookUp(code: payload)
        return true
    }

    private func route(_ uri: PopsURI) {
        switch router.route(uri) {
        case .handled:
            didRouteElsewhere = true
        case .unsupported(let pillar):
            phase = .unsupported(pillar: pillar)
        }
    }

    private func lookUp(code: String) {
        phase = .loading
        pendingLookup = Task { [weak self, store] in
            for await record in store.observe(Self.query(code: code)) {
                self?.phase = record.map(InventoryScanPhase.found) ?? .targetMissing
                return
            }
        }
    }

    /// A found row's thumbnail, the same way every other list in this
    /// feature loads one.
    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    private static func query(code: String) -> InventoryQuery<InventoryRecord?> {
        InventoryQuery { source in
            guard let item = source.inventoryItem(withCode: code) else { return nil }
            return InventoryRecordReader(source: source).record(item)
        }
    }
}
