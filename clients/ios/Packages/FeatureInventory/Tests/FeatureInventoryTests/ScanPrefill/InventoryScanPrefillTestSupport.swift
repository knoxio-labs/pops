import AppCore
import AppCoreFakes
import Observation

@testable import FeatureInventory

@MainActor @Observable
internal final class ScanPrefillAvailabilityState {
    internal var isAvailable: Bool

    internal init(isAvailable: Bool) {
        self.isAvailable = isAvailable
    }
}

@MainActor
internal final class ScanPrefillCallbackRecorder {
    internal private(set) var invocations = 0

    internal func call() {
        invocations += 1
    }
}

internal actor ScanPrefillGate {
    private var entered = false
    private var isOpen = false
    private let entries: AsyncStream<Void>
    private let entryContinuation: AsyncStream<Void>.Continuation
    private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

    internal init() {
        let (entries, continuation) = AsyncStream<Void>.makeStream()
        self.entries = entries
        entryContinuation = continuation
    }

    internal func wait() async {
        entered = true
        entryContinuation.yield()
        guard !isOpen else { return }
        await withCheckedContinuation { releaseWaiters.append($0) }
    }

    internal func awaitEntry() async {
        guard !entered else { return }
        var iterator = entries.makeAsyncIterator()
        _ = await iterator.next()
    }

    internal func open() {
        isOpen = true
        let waiters = releaseWaiters
        releaseWaiters.removeAll()
        for waiter in waiters { waiter.resume() }
    }
}

internal actor ScanPrefillGenerator: InventoryPrefillGenerator {
    internal let tokenBudget = 10_000
    private let answer: [String: InventoryPrefillRawValue]
    private let gate: ScanPrefillGate?
    private(set) var requests: [RecordingInventoryPrefillGenerator.Request] = []

    internal init(
        answer: [String: InventoryPrefillRawValue] = [:], gate: ScanPrefillGate? = nil
    ) {
        self.answer = answer
        self.gate = gate
    }

    internal func tokenCount(_ text: String) async -> Int { text.count }

    internal func generate(
        source: InventoryPrefillSource, fields: [InventoryCatalogueField]
    ) async throws -> [String: InventoryPrefillRawValue] {
        requests.append(.init(source: source, fieldIDs: fields.map(\.id)))
        if let gate { await gate.wait() }
        return answer
    }
}

internal actor ScanPrefillLookupGate {
    private let result: InventoryBarcodeLookup
    private let gate: ScanPrefillGate
    private(set) var payloads: [String] = []

    internal init(result: InventoryBarcodeLookup, gate: ScanPrefillGate) {
        self.result = result
        self.gate = gate
    }

    internal func lookUp(_ payload: String) async throws -> InventoryBarcodeLookup {
        payloads.append(payload)
        await gate.wait()
        return result
    }
}

internal struct ScanPrefillLookupFailure: Error {}

@MainActor
internal enum ScanPrefillFixture {
    internal static let detail = InventoryPrefillTestSupport.field(
        id: "detail", label: "Detail")
    internal static let alternateDetail = InventoryCatalogueField(
        id: "alternate-detail", typeId: "alternate", key: "alternate-detail",
        label: "Alternate detail", sortOrder: 0, kind: .shortText,
        cardinality: .one, required: false, storage: .stored)
    internal static let productType = InventoryPrefillTestSupport.type(fields: [detail])
    internal static let alternateType = InventoryCatalogueType(
        id: "alternate", key: "alternate", label: "Alternate", sortOrder: 1,
        fields: [alternateDetail])
    internal static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
        types: [productType, alternateType])
    internal static let product = InventoryBarcodeProduct(
        title: "The Hitchhiker's Guide to the Galaxy", subtitle: "A Trilogy in Five Parts",
        contributors: [
            InventoryBarcodeContributor(name: "Douglas Adams", role: "Author"),
            InventoryBarcodeContributor(name: "  "),
        ], publisher: "Pan Books", publishedDate: "1979", pageCount: 224,
        language: "en", description: "Space comedy", subjects: ["Fiction", "  ", "Comedy"],
        attributes: ["Format": "Paperback", "Empty": "  "])

    internal struct Opened {
        internal let form: InventoryItemFormModel
        internal let loading: Task<Void, Never>
        internal let lookup: FakeInventoryBarcodeLookupService
    }

    internal struct OpenedForm {
        internal let form: InventoryItemFormModel
        internal let loading: Task<Void, Never>
    }

    internal static func open(
        request: InventoryItemFormRequest = .create(placement: nil),
        status: InventoryReplicaStatus = .current, available: Bool = true,
        lookupResult: InventoryBarcodeLookup = .found(product),
        generator: any InventoryPrefillGenerator = ScanPrefillGenerator(),
        selectType: Bool = true
    ) async -> Opened {
        let lookup = FakeInventoryBarcodeLookupService(result: lookupResult)
        let availability = InventoryPrefillAvailability { available }
        let scan = InventoryScanPrefill(
            lookUp: { try await lookup.lookUp(code: $0) },
            engine: InventoryPrefillEngine(generator: generator), availability: availability)
        let items = item(for: request).map { [$0] } ?? []
        let store = RecordingFormStore(
            FormFixtureSource(items: items, protocol2Catalogue: catalogue, status: status))
        let form = InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, scan: scan)
        let loading = await form.startAndAwaitReady()
        if selectType, form.mode == .create { form.selectProtocol2Type(productType.id) }
        return Opened(form: form, loading: loading, lookup: lookup)
    }

    internal static func open(
        lookUp: @escaping @Sendable (String) async throws -> InventoryBarcodeLookup,
        status: InventoryReplicaStatus = .current,
        generator: any InventoryPrefillGenerator = ScanPrefillGenerator()
    ) async -> OpenedForm {
        let scan = InventoryScanPrefill(
            lookUp: lookUp, engine: InventoryPrefillEngine(generator: generator),
            availability: InventoryPrefillAvailability { true })
        let store = RecordingFormStore(
            FormFixtureSource(protocol2Catalogue: catalogue, status: status))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound, scan: scan)
        let loading = await form.startAndAwaitReady()
        form.selectProtocol2Type(productType.id)
        return OpenedForm(form: form, loading: loading)
    }

    private static func item(for request: InventoryItemFormRequest) -> InventoryItem? {
        let id: String
        switch request {
        case .edit(let itemId), .labelling(let itemId): id = itemId
        case .create, .repair: return nil
        }
        return InventoryItem(
            id: id, revision: 1, seq: 1, catalogueRevision: 1, name: "Stored",
            typeId: productType.id, typeKey: productType.key, fieldValues: [], placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
    }
}
