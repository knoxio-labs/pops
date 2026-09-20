import AppCore
import Foundation
import Synchronization

@testable import FeatureInventory

/// A replica the form reads, with a search that covers codes the way the
/// real replica's does (name, code and note), which the shared in-memory fake
/// does not: its search matches names only.
internal struct FormFixtureSource: InventoryQuerySource {
    var items: [InventoryItem] = []
    var locations: [InventoryLocation] = []
    var catalogue = InventoryCatalogue(version: "test", units: [], types: [])
    var status: InventoryReplicaStatus = .current
    var photoUploads: [String: InventoryPhotoUpload] = [:]

    func inventoryItem(id: String) -> InventoryItem? { items.first { $0.id == id } }
    func inventoryItem(withCode code: String) -> InventoryItem? {
        items.first { !$0.isDeleted && $0.code?.caseInsensitiveCompare(code) == .orderedSame }
    }
    func inventoryLocation(id: String) -> InventoryLocation? { locations.first { $0.id == id } }
    func inventoryLocationTree() -> [InventoryLocation] { locations }
    func inventoryContents(ofLocation locationId: String) -> [InventoryItem] { [] }
    func inventoryContents(ofContainer containerId: String) -> [InventoryItem] { [] }
    func inventoryInHand() -> [InventoryItem] { [] }
    func inventoryOpenContainers() -> [InventoryItem] { [] }
    func inventoryContainers() -> [InventoryItem] {
        items.filter { $0.isContainer && !$0.isDeleted }
    }
    func inventoryItems(includeInactive: Bool) -> [InventoryItem] {
        items.filter { !$0.isDeleted && (includeInactive || $0.lifecycle == .active) }
    }
    func inventoryRecents(limit: Int) -> [InventoryItem] { [] }
    func inventoryRecentEvents(limit: Int) -> [InventoryEvent] { [] }
    func inventoryCounts() -> InventoryCounts {
        InventoryCounts(items: 0, containers: 0, locations: 0)
    }

    func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] {
        items.filter { item in
            item.name.localizedCaseInsensitiveContains(text)
                || (item.code?.localizedCaseInsensitiveContains(text) ?? false)
        }
    }

    func inventoryItemHistory(itemId: String) -> [InventoryEvent] { [] }
    func inventoryLocationHistory(locationId: String) -> [InventoryEvent] { [] }
    func inventoryCatalogue() -> InventoryCatalogue { catalogue }
    func inventorySyncLedger() -> InventoryReplicaSyncLedger { InventoryReplicaSyncLedger() }
    func inventoryReplicaStatus() -> InventoryReplicaStatus { status }
    func inventoryPhotoUploads() -> [String: InventoryPhotoUpload] { photoUploads }
    func inventoryAwaitingTypeArrivals() -> [String] { [] }
}

/// A store that records every command in order and applies none, answering
/// every query from a `FormFixtureSource` it can change mid-test.
internal final class RecordingFormStore: InventoryStore, Sendable {
    private struct State {
        var source: FormFixtureSource
        var performed: [InventoryCommand] = []
        var failing: Set<String> = []
        var observers: [UUID: @Sendable (FormFixtureSource) -> Void] = [:]
        var uploaded: [(sha256: String, data: Data)] = []
        var uploadFailure: Error?
        var discarded: [String] = []
    }

    private let state: Mutex<State>

    internal init(_ source: FormFixtureSource) {
        state = Mutex(State(source: source))
    }

    internal var performed: [InventoryCommand] { state.withLock { $0.performed } }
    internal var uploaded: [(sha256: String, data: Data)] { state.withLock { $0.uploaded } }
    internal var discarded: [String] { state.withLock { $0.discarded } }

    /// Makes every command of this kind throw `RepositoryError.unavailable`.
    internal func fail(_ kind: String) {
        state.withLock { _ = $0.failing.insert(kind) }
    }

    /// Makes every `uploadPhoto` call throw this error instead of succeeding.
    /// `nil` clears a previously scripted failure.
    internal func failUploads(with error: Error?) {
        state.withLock { $0.uploadFailure = error }
    }

    internal func setStatus(_ status: InventoryReplicaStatus) {
        change { $0.status = status }
    }

    /// Reports how far each staged photo got, as a local-first store does.
    internal func setPhotoUploads(_ uploads: [String: InventoryPhotoUpload]) {
        change { $0.photoUploads = uploads }
    }

    private func change(_ edit: (inout FormFixtureSource) -> Void) {
        let (source, observers) = state.withLock { current in
            edit(&current.source)
            return (current.source, Array(current.observers.values))
        }
        for observer in observers { observer(source) }
    }

    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { continuation in
            let id = UUID()
            let source = state.withLock { current in
                current.observers[id] = { continuation.yield(query.read($0)) }
                return current.source
            }
            continuation.yield(query.read(source))
            continuation.onTermination = { [weak self] _ in
                self?.state.withLock { _ = $0.observers.removeValue(forKey: id) }
            }
        }
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        let kind = Self.kind(of: command)
        try state.withLock { current in
            current.performed.append(command)
            if current.failing.contains(kind) { throw RepositoryError.unavailable }
        }
        return InventoryReceipt(
            mutationId: UUID().uuidString, entityKind: command.entityKind,
            entityId: command.entityId)
    }

    func undo(_ receipt: InventoryReceipt) async throws {}
    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {}
    func download() async throws {}
    func refresh() async {}

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.unavailable
    }

    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try state.withLock { current in
            current.uploaded.append((sha256, data))
            if let failure = current.uploadFailure { throw failure }
        }
        return InventoryMediaUploadResult(sha256: sha256, alreadyStored: false)
    }

    func discardPhoto(_ sha256: String) async throws {
        state.withLock { $0.discarded.append(sha256) }
    }

    func status() -> AsyncStream<InventoryReplicaStatus> { observe(.replicaStatus) }

    func settleTypeArrival(typeKey: String) async throws {}

    private static func kind(of command: InventoryCommand) -> String {
        switch command {
        case .createItem: "create"
        case .setItemCode: "setCode"
        default: "other"
        }
    }
}

internal enum FormFixture {
    static let epoch = Date(timeIntervalSinceReferenceDate: 800_000_000)

    static let units = [
        InventoryUnit(key: "mm", dimension: "length", multiplierToBase: 0.001),
        InventoryUnit(key: "cm", dimension: "length", multiplierToBase: 0.01),
        InventoryUnit(key: "m", dimension: "length", multiplierToBase: 1),
        InventoryUnit(key: "W", dimension: "power", multiplierToBase: 1),
    ]

    static let connector = InventoryFieldDefinition(
        key: "end_a", label: "End A", kind: .choice, choices: ["USB-A", "USB-C", "Lightning"])
    static let length = InventoryFieldDefinition(
        key: "length", label: "Length", kind: .measurement, dimension: "length", defaultUnit: "m")
    static let wattage = InventoryFieldDefinition(
        key: "wattage", label: "Wattage", kind: .measurement, dimension: "power", defaultUnit: "W",
        required: true)

    static let cable = InventoryType(
        key: "cable", name: "Cable", capabilities: [], fields: [connector, length])
    static let charger = InventoryType(
        key: "charger", name: "Charger", capabilities: [], fields: [wattage])

    static let catalogue = InventoryCatalogue(version: "v1", units: units, types: [cable, charger])

    static func item(
        _ id: String, _ name: String, code: String? = nil, typeKey: String? = nil,
        fields: [String: InventoryFieldValue] = [:], placement: InventoryPlacement = .hand
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: typeKey, fields: fields, code: code,
            placement: placement, createdAt: epoch, updatedAt: epoch)
    }
}

extension InventoryItemFormModel {
    /// Starts following the store and waits until the form is ready, or
    /// gives up after a deadline so a store that never answers fails the
    /// test instead of hanging it.
    @discardableResult
    func startAndAwaitReady() async -> Task<Void, Never> {
        let task = Task { await load() }
        await awaitObservedCondition { [self] in phase != .loading }
        return task
    }

    /// Waits until `condition` holds, within the same deadline.
    func await(_ condition: @escaping @Sendable @MainActor () -> Bool) async -> Bool {
        if condition() { return true }
        await awaitObservedCondition(condition)
        return condition()
    }
}
