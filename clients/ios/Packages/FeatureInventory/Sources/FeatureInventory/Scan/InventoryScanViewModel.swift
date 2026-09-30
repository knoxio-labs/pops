import AppCore
import Foundation
import Observation

/// The scan screen's whole decision surface (POPS-4078, POPS-4108): a
/// `pops://` reference, the item's own printed code, or an external
/// identifier such as a product barcode or ISBN.
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
    /// Set when a product barcode resolved to exactly one item: the screen
    /// pushes it straight away rather than waiting on the found card's Open.
    /// The phase is ``InventoryScanPhase/found(_:)`` for the same record, so
    /// coming back lands on the card.
    internal var opened: InventoryRoute?

    /// The in-flight code lookup, exposed so a test can await it instead of
    /// polling ``phase``.
    internal private(set) var pendingLookup: Task<Void, Never>?

    private let store: any InventoryStore
    private let router: any EntityRouter
    private let camera: any CameraAuthorizing
    private let recents: UserDefaults

    internal init(
        store: any InventoryStore,
        router: any EntityRouter,
        camera: any CameraAuthorizing = SystemCameraAuthorization(),
        recents: UserDefaults = .standard
    ) {
        self.store = store
        self.router = router
        self.camera = camera
        self.recents = recents
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
            if uri.pillar == InventoryEntity.pillar, uri.type == "item" {
                InventorySearchRecents.recordingScan(uri.id, in: recents)
            }
            didRouteElsewhere = true
        case .unsupported(let pillar):
            phase = .unsupported(pillar: pillar)
        }
    }

    private func lookUp(code: String) {
        phase = .loading
        pendingLookup = Task { [weak self, store] in
            for await resolution in store.observe(Self.query(code: code)) {
                self?.settle(resolution)
                return
            }
        }
    }

    private func settle(_ resolution: InventoryScanResolution) {
        switch resolution {
        case .code(let record):
            InventorySearchRecents.recordingScan(record.id, in: recents)
            phase = .found(record)
        case .identifier(let records):
            guard let first = records.first else {
                phase = .targetMissing
                return
            }
            guard records.count == 1 else {
                phase = .matches(records)
                return
            }
            InventorySearchRecents.recordingScan(first.id, in: recents)
            phase = .found(first)
            opened = .record(id: first.id, isContainer: first.isContainer)
        }
    }

    /// A found row's thumbnail, the same way every other list in this
    /// feature loads one.
    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    /// The item's own code wins: it is unique, and a label printed for one
    /// item names that item even if its text also appears as someone else's
    /// barcode. Only a code no item holds falls through to external
    /// identifiers, which nothing makes unique.
    private static func query(code: String) -> InventoryQuery<InventoryScanResolution> {
        InventoryQuery { source in
            let reader = InventoryRecordReader(source: source)
            if let item = source.inventoryItem(withCode: code) {
                return .code(reader.record(item))
            }
            return .identifier(
                source.inventoryItems(withExternalIdentifier: code).map(reader.record))
        }
    }
}

private enum InventoryScanResolution: Sendable {
    case code(InventoryRecord)
    case identifier([InventoryRecord])
}
