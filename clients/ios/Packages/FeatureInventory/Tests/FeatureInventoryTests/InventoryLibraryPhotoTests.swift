import AppCore
import Foundation
import Testing

@testable import FeatureInventory

#if canImport(UIKit)
    import PhotosUI
    import UniformTypeIdentifiers
#endif

@MainActor
@Suite("Inventory library photo selection")
internal struct InventoryLibraryPhotoTests {
    @Test("multiple photos retain selection order and skip duplicates")
    func selectionOrder() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let first = Data("first photo".utf8)
        let second = Data("second photo".utf8)
        await form.photoCaptured(first)

        await form.photosSelected([second, first, second])

        let hashes = [first, second].map { InventoryPhotoHashing.sha256(of: $0) }
        #expect(form.draft.photos.map(\.sha256) == hashes)
        #expect(store.uploaded.map(\.sha256) == hashes)
        #expect(form.localPhotoData[hashes[1]] == second)
    }

    @Test("all selected photos enter the draft before the first upload can suspend")
    func stagesEntireSelection() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let photos = [Data("first".utf8), Data("second".utf8)]
        let hashes = photos.map { InventoryPhotoHashing.sha256(of: $0) }
        store.observeUploads {
            await MainActor.run {
                #expect(form.draft.photos.map(\.sha256) == hashes)
            }
        }

        await form.photosSelected(photos)

        #expect(store.uploaded.count == 2)
    }

    @Test("cancelling the library selection leaves existing photos alone")
    func emptySelection() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        await form.photoCaptured(Data("existing photo".utf8))
        let photos = form.draft.photos

        await form.photosSelected([])

        #expect(form.draft.photos == photos)
        #expect(store.uploaded.count == 1)
    }

    @Test("an upload failure does not drop the rest of the selection")
    func uploadFailure() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(with: RepositoryError.transport("upload unavailable"))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let photos = [Data("first".utf8), Data("second".utf8)]

        await form.photosSelected(photos)

        #expect(
            form.draft.photos.map(\.sha256) == photos.map { InventoryPhotoHashing.sha256(of: $0) })
        for photo in form.draft.photos {
            guard case .failed = photo.upload else {
                Issue.record("expected each failed upload to remain available for retry")
                continue
            }
            #expect(form.localPhotoData[photo.sha256] != nil)
        }
    }

    #if canImport(UIKit)
        @Test("library loading keeps valid images in order across unreadable selections")
        func libraryLoading() async throws {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            let firstRenderer = UIGraphicsImageRenderer(
                size: CGSize(width: 10, height: 20), format: format)
            let secondRenderer = UIGraphicsImageRenderer(
                size: CGSize(width: 30, height: 40), format: format)
            let first = try #require(firstRenderer.image { _ in }.pngData())
            let second = try #require(secondRenderer.image { _ in }.pngData())
            let providers = [first, Data("invalid image".utf8), second].map { data in
                let provider = NSItemProvider()
                provider.registerDataRepresentation(
                    forTypeIdentifier: UTType.png.identifier, visibility: .all
                ) { completion in
                    completion(data, nil)
                    return nil
                }
                return provider
            }
            let failed = NSItemProvider()
            failed.registerDataRepresentation(
                forTypeIdentifier: UTType.png.identifier, visibility: .all
            ) { completion in
                completion(nil, CocoaError(.fileReadCorruptFile))
                return nil
            }

            let photos = await InventoryLibraryPhotoPicker.Coordinator.loadPhotos(
                [providers[0], failed, providers[1], providers[2]])

            #expect(photos.count == 2)
            let sizes = photos.compactMap { UIImage(data: $0)?.size }
            #expect(sizes == [CGSize(width: 10, height: 20), CGSize(width: 30, height: 40)])
            #expect(await InventoryLibraryPhotoPicker.Coordinator.loadPhotos([]).isEmpty)
        }

        @Test("library additions allow ordered multiple selection; replacement allows one")
        func pickerConfiguration() {
            let adding = InventoryLibraryPhotoPicker.configuration(selectionLimit: 0)
            #expect(adding.selectionLimit == 0)
            #expect(adding.selection == .ordered)
            #expect(adding.filter == .images)
            #expect(
                InventoryLibraryPhotoPicker.configuration(selectionLimit: 1).selectionLimit == 1)
        }
    #endif
}
