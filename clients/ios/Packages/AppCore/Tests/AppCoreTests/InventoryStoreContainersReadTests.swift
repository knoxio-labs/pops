import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("In-memory inventory store, every container")
internal struct InventoryStoreContainersReadTests {
    private static func item(
        _ id: String, placement: InventoryPlacement, access: InventoryAccess? = nil,
        lifecycle: InventoryLifecycle = .active, deletedAt: Date? = nil
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: id, typeKey: nil, lifecycle: lifecycle,
            placement: placement,
            containment: access.map { InventoryContainment(access: $0, isFull: false) },
            createdAt: .now, updatedAt: .now, deletedAt: deletedAt)
    }

    @Test("every container is listed whatever its access or lifecycle, and none once deleted")
    func containersIncludeClosedAndInactive() async throws {
        let store = InMemoryInventoryStore(items: [
            Self.item("open-box", placement: .location("loc"), access: .open),
            Self.item("closed-box", placement: .container("open-box"), access: .closed),
            Self.item("retired-box", placement: .hand, access: .closed, lifecycle: .retired),
            Self.item("gone-box", placement: .hand, access: .open, deletedAt: .now),
            Self.item("plate", placement: .container("open-box")),
        ])

        var values = store.observe(.containers).makeAsyncIterator()
        let containers = try #require(await values.next())

        #expect(containers.map(\.id) == ["closed-box", "open-box", "retired-box"])
    }

    @Test("open containers are the active, undeleted containers whose access is open")
    func openContainersExcludeDeletedClosedAndInactive() async throws {
        let store = InMemoryInventoryStore(items: [
            Self.item("open-box", placement: .location("loc"), access: .open),
            Self.item("closed-box", placement: .hand, access: .closed),
            Self.item("retired-box", placement: .hand, access: .open, lifecycle: .retired),
            Self.item("gone-box", placement: .hand, access: .open, deletedAt: .now),
            Self.item("plate", placement: .container("open-box")),
        ])

        var values = store.observe(.openContainers).makeAsyncIterator()
        let open = try #require(await values.next())

        #expect(open.map(\.id) == ["open-box"])
    }
}
