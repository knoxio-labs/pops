import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("The type-arrived sheet")
internal struct InventoryTypeArrivalTests {
    private static let box = InventoryType(
        key: "storage_box", name: "Storage box", capabilities: [.containment], fields: [],
        legacyLabels: ["Box"])
    private static let bag = InventoryType(
        key: "bag", name: "Bag", capabilities: [], fields: [], legacyLabels: ["Bag"])
    private static let before = InventoryCatalogue(version: "v1", units: [], types: [box])
    private static let after = InventoryCatalogue(version: "v2", units: [], types: [box, bag])

    private static func untyped(
        _ id: String, _ name: String, legacy: String?, at placement: InventoryPlacement = .hand
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: nil, legacyType: legacy,
            placement: placement, createdAt: InventoryFixture.epoch,
            updatedAt: InventoryFixture.epoch)
    }

    /// A store holding three untyped items, two of them bags by their old
    /// free text and one merely named like a bag, whose catalogue has just
    /// gained the Bag type.
    private static func arrived() -> InMemoryInventoryStore {
        let store = InMemoryInventoryStore(
            items: [
                untyped("canvas", "Canvas bag", legacy: "Bag", at: .location("study")),
                untyped("sleeping", "Sleeping bag", legacy: "bag"),
                untyped("tripod", "Bag of tripod bits", legacy: "Camera"),
            ],
            locations: [InventoryFixture.location("study", "Study")],
            catalogue: before)
        store.receiveCatalogue(after)
        return store
    }

    private static func latest(
        _ store: any InventoryStore
    ) async throws -> InventoryTypeArrivalPrompt? {
        var iterator = store.observe(InventoryTypeArrivalPrompt.query).makeAsyncIterator()
        return try #require(await iterator.next())
    }

    /// Feeds the model what the store answers now, as `observe()` would.
    private static func deliver(to model: InventoryTypeArrivalModel) async throws {
        await model.receive(try await latest(model.runner.store))
    }

    @Test("an arrival opens with only the items its legacy labels match, all ticked, placed")
    func opensWithLabelMatches() async throws {
        let model = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: Self.arrived()))

        try await Self.deliver(to: model)

        let prompt = try #require(model.presented)
        #expect(prompt.typeName == "Bag")
        #expect(prompt.rows.map(\.id) == ["canvas", "sleeping"])
        #expect(prompt.rows.map(\.place) == ["Study", nil])
        #expect(model.ticked == ["canvas", "sleeping"])
    }

    @Test("the sheet fires once: opening it records the ask, and nothing reopens it")
    func firesOnce() async throws {
        let store = Self.arrived()
        let model = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: store))
        try await Self.deliver(to: model)
        #expect(model.presented != nil)
        #expect(try await Self.latest(store) == nil)

        try await Self.deliver(to: model)
        await model.close()
        try await Self.deliver(to: model)

        #expect(model.presented == nil)
    }

    @Test("Not now persists: a model made after a relaunch over the same store asks nothing")
    func notNowPersists() async throws {
        let store = Self.arrived()
        let first = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: store))
        try await Self.deliver(to: first)
        await first.close()

        let relaunched = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: store))
        try await Self.deliver(to: relaunched)

        #expect(relaunched.presented == nil)
        #expect(try await Self.latest(store) == nil)
    }

    @Test("an arrival that cannot be recorded is not shown, so it cannot come back every launch")
    func unrecordableArrivalIsNotShown() async throws {
        let model = InventoryTypeArrivalModel(
            runner: InventoryCommandRunner(store: FailingInventoryStore()))
        await model.receive(
            InventoryTypeArrivalPrompt(
                typeKey: "bag", typeName: "Bag",
                rows: [.init(id: "canvas", name: "Canvas bag", place: nil, photo: nil)]))
        #expect(model.presented == nil)
    }

    @Test("Apply issues item.changeType for exactly the ticked items and offers Undo")
    func applyTypesExactlyTheTicked() async throws {
        let base = Self.arrived()
        let recording = RecordingInventoryStore(base)
        let runner = InventoryCommandRunner(store: recording)
        let model = InventoryTypeArrivalModel(runner: runner)
        try await Self.deliver(to: model)
        model.toggle("sleeping")

        let landed = await model.apply()

        #expect(landed)
        #expect(
            recording.commands == [.changeItemType(id: "canvas", typeKey: "bag", fields: [:])])
        #expect(runner.undoOffer?.message == "Typed 1 as Bag")
        #expect(model.presented == nil)
        var items = base.observe(.items()).makeAsyncIterator()
        let typed = try #require(await items.next()).filter { $0.typeKey == "bag" }.map(\.id)
        #expect(typed == ["canvas"])
    }

    @Test("Undo after Apply returns every typed item to untyped")
    func undoReversesApply() async throws {
        let base = Self.arrived()
        let runner = InventoryCommandRunner(store: base)
        let model = InventoryTypeArrivalModel(runner: runner)
        try await Self.deliver(to: model)
        await model.apply()
        let offer = try #require(runner.undoOffer)
        #expect(offer.message == "Typed 2 as Bag")

        await runner.undo(offer)

        var items = base.observe(.items()).makeAsyncIterator()
        let all = try #require(await items.next())
        #expect(all.allSatisfy { $0.typeKey == nil })
    }

    @Test("Apply with nothing ticked issues nothing")
    func applyWithNothingTicked() async throws {
        let recording = RecordingInventoryStore(Self.arrived())
        let model = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: recording))
        try await Self.deliver(to: model)
        model.toggle("canvas")
        model.toggle("sleeping")

        #expect(await model.apply() == false)
        #expect(recording.commands.isEmpty)
    }

    @Test("a second arrival waits for the first sheet to close, then opens")
    func secondArrivalWaits() async throws {
        let tray = InventoryType(
            key: "tray", name: "Tray", capabilities: [], fields: [], legacyLabels: ["Tray"])
        let store = InMemoryInventoryStore(
            items: [
                Self.untyped("canvas", "Canvas bag", legacy: "Bag"),
                Self.untyped("desk", "Desk tray", legacy: "Tray"),
            ],
            catalogue: Self.before)
        store.receiveCatalogue(Self.after)
        store.receiveCatalogue(
            InventoryCatalogue(version: "v3", units: [], types: [Self.box, Self.bag, tray]))
        let model = InventoryTypeArrivalModel(runner: InventoryCommandRunner(store: store))
        try await Self.deliver(to: model)
        #expect(model.presented?.typeKey == "bag")

        try await Self.deliver(to: model)
        #expect(model.presented?.typeKey == "bag")
        await model.close()

        #expect(model.presented?.typeKey == "tray")
        #expect(model.ticked == ["desk"])
        #expect(try await Self.latest(store) == nil)
    }
}
