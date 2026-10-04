import AppCore
import Foundation
import Observation

/// What Store here's scanner did with the one item a code named.
internal enum InventoryStoreScanOutcome: Equatable, Sendable {
    case stored
    case alreadyHere
    /// The target itself, a container the target sits inside, or an item
    /// that is no longer active: nothing the existing-item list offers either.
    case refused
}

/// Where Store here's scanner is. The camera keeps running through every
/// phase but ``denied``: an answer stays up until the next code replaces it.
internal enum InventoryStoreScanPhase: Equatable {
    case scanning
    case loading
    case answered(InventoryRecord, InventoryStoreScanOutcome)
    /// An external identifier several storable items carry, ordered by name:
    /// one is picked rather than guessed.
    case matches([InventoryRecord])
    /// A well-formed `pops://` reference to something other than an item.
    case notAnItem
    case notPops
    case notFound
    case failed
    case denied
}

/// Store here by scanning: each code is matched to an item, by `pops://`
/// reference, its own printed code, or an external identifier, and that item
/// is moved into the target straight away, one after another.
///
/// The camera reports a code on every frame it stays in view, so a payload is
/// acted on once and then ignored until it has been out of view for
/// ``repeatWindow``. Without that, an item just stored would be read again
/// and answered "already here" before anyone saw that it landed.
@MainActor @Observable
internal final class InventoryStoreScanModel {
    internal static let repeatWindow: TimeInterval = 2

    internal let target: InventoryStoreTarget
    internal private(set) var phase: InventoryStoreScanPhase = .scanning
    internal private(set) var storedCount = 0
    /// The in-flight lookup or move, exposed so a test can await it instead
    /// of polling ``phase``.
    internal private(set) var pending: Task<Void, Never>?

    private let runner: InventoryCommandRunner
    private let camera: any CameraAuthorizing
    private let now: () -> Date
    private var sightings: [String: Date] = [:]
    private var receipts: [InventoryReceipt] = []

    internal init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner,
        camera: any CameraAuthorizing = SystemCameraAuthorization(),
        now: @escaping () -> Date = Date.init
    ) {
        self.target = target
        self.runner = runner
        self.camera = camera
        self.now = now
    }

    /// Prompts if nobody has been asked, and scans only if the answer is yes.
    internal func start() async {
        phase = await camera.requestAccess() == .authorized ? .scanning : .denied
    }

    /// Reads the standing decision without prompting, for a return from
    /// Settings to pick up without reopening the sheet.
    internal func refreshCameraAccess() {
        if phase == .denied, camera.currentAccess() == .authorized { phase = .scanning }
    }

    /// Consumes a decoded payload. A code read while another is still being
    /// resolved is dropped unrecorded, so the next frame offers it again.
    internal func didScan(_ payload: String) {
        guard phase != .denied, phase != .loading else { return }
        let moment = now()
        sightings = sightings.filter { moment.timeIntervalSince($0.value) < Self.repeatWindow }
        let isRepeat = sightings[payload] != nil
        sightings[payload] = moment
        guard !isRepeat else { return }

        if let uri = parsePopsURI(payload) {
            guard case .item(let id) = InventoryEntity(uri) else {
                phase = .notAnItem
                return
            }
            lookUp(.id(id))
        } else if payload.hasPrefix("pops://") {
            phase = .notPops
        } else {
            lookUp(.code(payload))
        }
    }

    /// Stores one of the items ``InventoryStoreScanPhase/matches(_:)`` listed.
    internal func pick(_ record: InventoryRecord) {
        guard case .matches = phase else { return }
        phase = .loading
        pending = Task { [weak self] in await self?.store(record) }
    }

    /// Offers one Undo for everything this scanner stored. Called as the
    /// sheet closes, so the capsule shows on the page underneath.
    internal func finish() {
        guard !receipts.isEmpty else { return }
        runner.offer(
            receipts, message: target.storedMessage(count: storedCount), symbol: .storeHere)
        receipts = []
        storedCount = 0
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await runner.store.photo(sha256, variant: .thumb)
    }

    private func lookUp(_ reference: InventoryStoreScanReference) {
        phase = .loading
        let query = InventoryStoreScanCandidate.query(for: reference, target: target)
        pending = Task { [weak self, store = runner.store] in
            for await candidates in store.observe(query) {
                await self?.settle(candidates)
                return
            }
            self?.phase = .failed
        }
    }

    private func settle(_ candidates: [InventoryStoreScanCandidate]) async {
        guard let first = candidates.first else {
            phase = .notFound
            return
        }
        let storable = candidates.filter { $0.standing == nil }
        if storable.count > 1 {
            phase = .matches(storable.map(\.record))
        } else if let only = storable.first {
            await store(only.record)
        } else {
            let shown = candidates.first { $0.standing == .alreadyHere } ?? first
            phase = .answered(shown.record, shown.standing ?? .refused)
        }
    }

    private func store(_ record: InventoryRecord) async {
        let move = InventoryCommand.moveItem(id: record.id, to: target.placement, verb: .store)
        guard let landed = await runner.perform([move]) else {
            phase = .failed
            return
        }
        receipts += landed
        storedCount += 1
        phase = .answered(record, .stored)
    }
}

internal enum InventoryStoreScanReference: Sendable {
    case id(InventoryItem.ID)
    case code(String)
}

/// An item a scanned code named, and why it cannot be stored, if it cannot.
internal struct InventoryStoreScanCandidate: Sendable {
    internal let record: InventoryRecord
    /// Nil when the item can be stored in the target.
    internal let standing: InventoryStoreScanOutcome?

    /// The item's own code wins over the same text as another item's
    /// external identifier, the way the scan screen resolves it.
    internal static func query(
        for reference: InventoryStoreScanReference, target: InventoryStoreTarget
    ) -> InventoryQuery<[InventoryStoreScanCandidate]> {
        InventoryQuery { source in
            let items: [InventoryItem]
            switch reference {
            case .id(let id):
                items = source.inventoryItem(id: id).map { [$0] } ?? []
            case .code(let code):
                items =
                    source.inventoryItem(withCode: code).map { [$0] }
                    ?? source.inventoryItems(withExternalIdentifier: code)
            }
            let refused = InventoryStoreCandidate.refusedIds(for: target, source: source)
            let reader = InventoryRecordReader(source: source)
            return items.filter { !$0.isDeleted }.map { item in
                InventoryStoreScanCandidate(
                    record: reader.record(item),
                    standing: standing(of: item, in: target, refused: refused))
            }
        }
    }

    private static func standing(
        of item: InventoryItem, in target: InventoryStoreTarget, refused: Set<InventoryItem.ID>
    ) -> InventoryStoreScanOutcome? {
        if item.placement == target.placement { return .alreadyHere }
        if refused.contains(item.id) || item.lifecycle != .active { return .refused }
        return nil
    }
}
