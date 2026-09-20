import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

/// Item detail's own photo management: removing a photo already on the item
/// (`item.removePhoto`), reordering them (`item.reorderPhotos`) and Retake,
/// all through the page's shared `InventoryCommandRunner`. Unlike the form,
/// the page never has to put a photo back by hand on Undo: it reads
/// `InventoryItemDetail` from the store, so reverting the command is what
/// makes the query answer with the photo again.
@MainActor
@Suite("Item detail: managing photos already on the item")
internal struct InventoryItemDetailPhotoTests {
    private typealias Fixture = InventoryFixture

    private static func storeWithPhotos(_ sha256s: [String]) -> RecordingInventoryStore {
        let photos = sha256s.map { InventoryPhotoReference(sha256: $0, caption: nil) }
        let tv = InventoryItem(
            id: "tv", revision: 1, seq: 1, name: "Television", typeKey: nil,
            placement: .location("living"), photos: photos,
            createdAt: Fixture.epoch, updatedAt: Fixture.epoch)
        return RecordingInventoryStore(
            InMemoryInventoryStore(
                items: [tv], locations: [Fixture.location("living", "Living room")]))
    }

    @Test("removing a photo sends item.removePhoto and offers Undo")
    func removePhotoSendsCommand() async throws {
        let store = Self.storeWithPhotos(["a", "b"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.removePhoto("a")

        #expect(store.commands == [.removePhoto(itemId: "tv", sha256: "a")])
        #expect(model.runner.undoOffer?.message == "Removed photo")
        #expect(await model.awaitDetail { $0.photos.map(\.sha256) == ["b"] } != nil)
    }

    @Test("undoing a photo removal restores it through the store, not through local bookkeeping")
    func undoRestoresPhotoFromTheStore() async throws {
        let store = Self.storeWithPhotos(["a", "b"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.removePhoto("a")
        guard let offer = model.runner.undoOffer else {
            Issue.record("expected an undo offer")
            return
        }
        await model.runner.undo(offer)

        #expect(await model.awaitDetail { $0.photos.map(\.sha256) == ["a", "b"] } != nil)
    }

    @Test("removing a photo not on the item sends nothing")
    func removeUnknownPhotoIsInert() async throws {
        let store = Self.storeWithPhotos(["a"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.removePhoto("nope")

        #expect(store.commands.isEmpty)
    }

    @Test("moving a photo earlier sends the new order")
    func movePhotoEarlier() async throws {
        let store = Self.storeWithPhotos(["a", "b"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.movePhoto("b", .earlier)

        #expect(store.commands == [.reorderPhotos(itemId: "tv", sha256s: ["b", "a"])])
        #expect(await model.awaitDetail { $0.photos.map(\.sha256) == ["b", "a"] } != nil)
    }

    @Test("moving the last photo later does nothing")
    func moveLastPhotoLaterIsNoOp() async throws {
        let store = Self.storeWithPhotos(["a", "b"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.movePhoto("b", .later)

        #expect(store.commands.isEmpty)
    }

    @Test("retaking a photo attaches the new bytes where the old one stood and removes it")
    func retakeReplacesPhoto() async throws {
        let store = Self.storeWithPhotos(["a", "b"])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        let bytes = Data("a new photo".utf8)
        let newSha = InventoryPhotoHashing.sha256(of: bytes)

        await model.retakePhoto("a", with: bytes)

        #expect(
            store.commands == [
                .attachPhoto(itemId: "tv", sha256: newSha, position: 0),
                .removePhoto(itemId: "tv", sha256: "a"),
            ])
        #expect(await model.awaitDetail { $0.photos.map(\.sha256) == [newSha, "b"] } != nil)
    }
}
