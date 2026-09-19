import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// Managing photos already on the item, from the form: removing one
/// (`item.removePhoto`), reordering them (`item.reorderPhotos`) and Retake,
/// all through `InventoryItemFormModel.photoRunner`, offering Undo the way
/// every other immediate write in Inventory does.
@MainActor
@Suite("Item form: managing photos already on the item")
internal struct InventoryFormPhotoManagementTests {
    private func model(
        _ store: RecordingFormStore, request: InventoryItemFormRequest = .create(placement: nil)
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, mintId: { "new-1" })
    }

    @Test("removing an attached photo sends item.removePhoto and offers Undo")
    func removeAttachedPhotoSendsCommand() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photo = InventoryPhotoReference(sha256: "abc123", caption: nil)
        var withPhoto = item
        withPhoto = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: [photo],
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhoto], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit(withPhoto.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == ["abc123"])

        await form.removePhoto(sha256: "abc123")

        #expect(form.draft.photos.isEmpty)
        #expect(store.performed == [.removePhoto(itemId: withPhoto.id, sha256: "abc123")])
        #expect(form.photoRunner.undoOffer != nil)
    }

    @Test("undoing an attached photo removal reverses the command and restores the photo")
    func undoAttachedPhotoRemoval() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photo = InventoryPhotoReference(sha256: "abc123", caption: nil)
        let withPhoto = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: [photo],
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhoto], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit(withPhoto.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.removePhoto(sha256: "abc123")
        guard let offer = form.photoRunner.undoOffer else {
            Issue.record("expected an undo offer")
            return
        }
        await form.undoPhotoRemoval(offer)

        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == ["abc123"])
    }

    @Test("a failed attached photo removal keeps the photo in the draft")
    func removeAttachedPhotoFailureKeepsPhoto() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photo = InventoryPhotoReference(sha256: "abc123", caption: nil)
        let withPhoto = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: [photo],
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhoto], catalogue: FormFixture.catalogue))
        store.fail("other")
        let form = model(store, request: .edit(withPhoto.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.removePhoto(sha256: "abc123")

        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == ["abc123"])
        #expect(form.failure != nil)
    }

    @Test("moving an attached photo earlier sends the new order and offers Undo")
    func moveAttachedPhotoEarlier() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photos = [
            InventoryPhotoReference(sha256: "a", caption: nil),
            InventoryPhotoReference(sha256: "b", caption: nil),
        ]
        let withPhotos = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: photos,
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhotos], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit(withPhotos.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.movePhoto("b", .earlier)

        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == ["b", "a"])
        #expect(store.performed == [.reorderPhotos(itemId: withPhotos.id, sha256s: ["b", "a"])])
        #expect(form.photoRunner.undoOffer != nil)
    }

    @Test("moving the first attached photo earlier does nothing")
    func moveFirstPhotoEarlierIsNoOp() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photos = [
            InventoryPhotoReference(sha256: "a", caption: nil),
            InventoryPhotoReference(sha256: "b", caption: nil),
        ]
        let withPhotos = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: photos,
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhotos], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit(withPhotos.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.movePhoto("a", .earlier)

        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == ["a", "b"])
        #expect(store.performed.isEmpty)
    }

    @Test("retaking an attached photo stages the new one and removes the old")
    func retakeAttachedPhoto() async throws {
        let item = FormFixture.item("item-1", "Cable")
        let photo = InventoryPhotoReference(sha256: "abc123", caption: nil)
        let withPhoto = InventoryItem(
            id: item.id, revision: item.revision, seq: item.seq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, code: item.code,
            placement: item.placement, photos: [photo],
            createdAt: item.createdAt, updatedAt: item.updatedAt)
        let store = RecordingFormStore(
            FormFixtureSource(items: [withPhoto], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit(withPhoto.id))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let bytes = Data("a new photo".utf8)
        let newSha = InventoryPhotoHashing.sha256(of: bytes)

        await form.retake(replacing: "abc123", with: bytes)

        #expect(form.draft.photos.map(\InventoryFormPhoto.sha256) == [newSha])
        #expect(store.performed == [.removePhoto(itemId: withPhoto.id, sha256: "abc123")])
    }
}
