import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Assemblies and parts on the item page")
internal struct InventoryItemPartsTests {
    private typealias Fixture = InventoryFixture

    private static let kit = InventoryItemReference(id: "kit", name: "Ninja kit", code: nil)
    private static let cup = InventoryItemReference(id: "cup", name: "Cup", code: nil)
    private static let lid = InventoryItemReference(id: "lid", name: "Lid", code: nil)
    private static let toaster = InventoryItemReference(id: "toaster", name: "Toaster", code: nil)

    private static func service(links: [String: String] = [:]) -> InMemoryInventoryPartsService {
        InMemoryInventoryPartsService(
            items: [kit, cup, lid, toaster], assemblies: ["kit"], links: links,
            placements: ["cup": .container(id: "box", name: "Ninja blender")])
    }

    @Test("an assembly shows its parts with where each one is")
    func showsParts() async {
        let model = InventoryItemPartsModel(
            itemId: "kit", service: Self.service(links: ["cup": "kit"]))

        await model.load()

        #expect(model.parts?.canHaveParts == true)
        #expect(model.parts?.parts.map(\.id) == ["cup"])
        #expect(
            model.parts.map { InventoryPartPlacementLabel.text(for: $0.parts[0].placement) }
                == "In Ninja blender")
    }

    @Test("a part names its assembly")
    func showsAssembly() async {
        let model = InventoryItemPartsModel(
            itemId: "cup", service: Self.service(links: ["cup": "kit"]))

        await model.load()

        #expect(model.parts?.assembly == Self.kit)
        #expect(model.parts?.canHaveParts == false)
    }

    @Test("an item that is no assembly and part of none has no section")
    func hiddenWhenNothingToShow() async {
        let model = InventoryItemPartsModel(itemId: "toaster", service: Self.service())

        await model.load()

        #expect(model.phase == .hidden)
    }

    @Test("an unbound or offline service hides the section instead of showing an error")
    func hiddenWhenUnavailable() async {
        let model = InventoryItemPartsModel(itemId: "kit", service: UnboundInventoryPartsService())

        await model.load()

        #expect(model.phase == .hidden)
        #expect(model.refusal == nil)
    }

    @Test("adding several parts lands each and shows the new view")
    func addsParts() async {
        let service = Self.service()
        let model = InventoryItemPartsModel(itemId: "kit", service: service)
        await model.load()

        let landed = await model.add(["cup", "lid"])

        #expect(landed)
        #expect(model.parts?.parts.map(\.id) == ["cup", "lid"])
        #expect(await service.writes.map(\.part) == ["cup", "lid"])
    }

    @Test("a refused add stops at the refusal and shows the server's words")
    func refusedAdd() async {
        let service = Self.service(links: ["cup": "toaster"])
        let model = InventoryItemPartsModel(itemId: "kit", service: service)
        await model.load()

        let landed = await model.add(["cup", "lid"])

        #expect(!landed)
        #expect(model.refusal == "Already a part of Toaster")
        #expect(await service.writes.isEmpty)
    }

    @Test("removing a part takes it out of the list and keeps the section for the assembly")
    func removesPart() async {
        let model = InventoryItemPartsModel(
            itemId: "kit", service: Self.service(links: ["cup": "kit"]))
        await model.load()

        await model.remove("cup")

        #expect(model.parts?.parts.isEmpty == true)
        #expect(model.phase != .hidden)
    }

    @Test("the picker never offers the item itself, its assembly, or its existing parts")
    func pickerExclusions() async {
        let service = Self.service(links: ["cup": "kit", "kit": "toaster"])
        let parts = InventoryItemPartsModel(itemId: "kit", service: service)
        await parts.load()
        let store = InMemoryInventoryStore(
            items: ["kit", "cup", "lid", "toaster"].map { Fixture.item($0, $0, at: .hand) })
        let picker = InventoryAddPartsModel(parts: parts, store: store)
        let task = Task { await picker.observe() }
        defer { task.cancel() }

        #expect(await eventually { picker.shownCandidates.map(\.id) == ["lid"] })
        #expect(picker.commitTitle(count: 0) == "Add")
        #expect(picker.commitTitle(count: 2) == "Add 2")
    }

    @Test("the picker's commit adds what was picked through the parts model")
    func pickerCommits() async {
        let service = Self.service()
        let parts = InventoryItemPartsModel(itemId: "kit", service: service)
        await parts.load()
        let picker = InventoryAddPartsModel(
            parts: parts, store: InMemoryInventoryStore(items: [Fixture.item("lid", "Lid", at: .hand)]))
        picker.toggle("lid")

        let closed = await picker.commit()

        #expect(closed)
        #expect(await service.writes.map(\.part) == ["lid"])
    }

    @Test("placement wording covers every shape, falling back when a name is missing")
    func placementWording() {
        #expect(InventoryPartPlacementLabel.text(for: .hand) == "In hand")
        #expect(InventoryPartPlacementLabel.text(for: .location(id: "l", name: "Lounge")) == "Lounge")
        #expect(InventoryPartPlacementLabel.text(for: .location(id: "l", name: nil)) == "At a place")
        #expect(InventoryPartPlacementLabel.text(for: .container(id: "b", name: nil)) == "In a container")
    }
}
