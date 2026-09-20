import AppCore
import Foundation

extension InventoryItemFormModel {
    internal func thumbnail(_ sha256: String) async -> Data? {
        if let local = localPhotoData[sha256] { return local }
        return try? await store.photo(sha256, variant: .thumb)
    }

    /// Encodes, hashes and hands a freshly captured photo to the store
    /// (A22): the tile shows it as `.uploading` immediately, so the strip
    /// shows something the instant a picture is taken. Once the store has
    /// the bytes, the tile follows what the store reports for them (waiting
    /// for the network, uploading, uploaded, failed), or shows `.uploaded`
    /// for a store that sent them while the form waited. A failure never
    /// touches `draft.photos` beyond that one entry — the create or edit this
    /// form performs is never blocked by a photo that could not be sent.
    internal func photoCaptured(_ jpegData: Data) async {
        let sha256 = InventoryPhotoHashing.sha256(of: jpegData)
        localPhotoData[sha256] = jpegData
        guard !draft.photos.contains(where: { $0.sha256 == sha256 }) else { return }
        draft.photos.append(InventoryFormPhoto(sha256: sha256, upload: .uploading))
        await upload(sha256: sha256, data: jpegData)
    }

    /// Retries a photo whose upload failed, reusing the bytes captured
    /// earlier this session (never re-encoded, since JPEG encoding is
    /// deterministic on the same source and the failure was never about the
    /// bytes changing).
    internal func retryUpload(sha256: String) async {
        guard let data = localPhotoData[sha256],
            let index = draft.photos.firstIndex(where: { $0.sha256 == sha256 })
        else { return }
        draft.photos[index].handedOver = false
        draft.photos[index].upload = .uploading
        await upload(sha256: sha256, data: data)
    }

    /// Removes one photo from the strip: an attached one is taken off the
    /// item at once (`item.removePhoto`), through `photoRunner`, and offers
    /// Undo the way every other immediate write in Inventory does; anything
    /// still local (uploading, waiting, uploaded but not yet attached, or
    /// failed) is simply dropped from the draft, and its bytes are handed to
    /// the store to discard if nothing else still needs them.
    internal func removePhoto(sha256: String) async {
        guard let index = draft.photos.firstIndex(where: { $0.sha256 == sha256 }) else { return }
        let photo = draft.photos[index]
        guard case .attached = photo.upload else {
            draft.photos.remove(at: index)
            localPhotoData.removeValue(forKey: sha256)
            try? await store.discardPhoto(sha256)
            return
        }
        draft.photos.remove(at: index)
        guard
            let landed = await photoRunner.perform([.removePhoto(itemId: draft.id, sha256: sha256)])
        else {
            draft.photos.insert(photo, at: index)
            adoptPhotoRunnerFailure()
            return
        }
        photoRunner.offer(landed, message: "Removed photo", symbol: .photo)
        if let offer = photoRunner.undoOffer {
            removedPhotos[offer.id] = (photo, index)
        }
    }

    /// Reverses a photo removal: cancels it if it never left the phone,
    /// reverts it with a compensating `item.attachPhoto` if it did, and puts
    /// the photo back where the strip showed it.
    internal func undoPhotoRemoval(_ offer: InventoryUndoOffer) async {
        await photoRunner.undo(offer)
        guard let entry = removedPhotos.removeValue(forKey: offer.id) else { return }
        draft.photos.insert(entry.photo, at: min(entry.index, draft.photos.count))
    }

    /// Moves one attached photo among the others already on the item
    /// (`item.reorderPhotos`), through `photoRunner`, offering Undo. Photos
    /// still local (never attached) keep their place after the reordered
    /// attached ones: the server has no order to record for bytes it has not
    /// been told about yet. Does nothing for a photo not attached, or
    /// already at that end.
    internal func movePhoto(_ sha256: String, _ direction: InventoryPhotoReorderDirection) async {
        guard let sha256s = draft.photos.reorderedAttachedIds(moving: sha256, direction) else {
            return
        }
        let previous = draft.photos
        let bySha = Dictionary(uniqueKeysWithValues: draft.photos.map { ($0.sha256, $0) })
        let reordered = sha256s.compactMap { bySha[$0] }
        let staged = draft.photos.filter { photo in
            guard case .attached = photo.upload else { return true }
            return false
        }
        draft.photos = reordered + staged
        guard
            let landed = await photoRunner.perform([
                .reorderPhotos(itemId: draft.id, sha256s: sha256s)
            ])
        else {
            draft.photos = previous
            adoptPhotoRunnerFailure()
            return
        }
        photoRunner.offer(landed, message: "Reordered photos", symbol: .photo)
    }

    /// Replaces one photo with a freshly captured one, in the same motion a
    /// person reaches for Retake for: the new photo is staged the way any
    /// capture is, and the one it replaces is removed the way ``removePhoto(sha256:)``
    /// removes any other.
    internal func retake(replacing sha256: String, with jpegData: Data) async {
        await photoCaptured(jpegData)
        await removePhoto(sha256: sha256)
    }

    private func upload(sha256: String, data: Data) async {
        do {
            _ = try await store.uploadPhoto(sha256: sha256, data: data, contentType: .jpeg)
            guard let index = draft.photos.firstIndex(where: { $0.sha256 == sha256 }) else {
                return
            }
            draft.photos[index].handedOver = true
            draft.photos[index].upload = .uploaded
            followStoreUploads()
        } catch InventoryStorageError.full {
            setUpload(.failed(InventoryCopy.photoStorageFull), for: sha256)
        } catch let error as RepositoryError {
            setUpload(.failed(InventoryCopy.message(for: error)), for: sha256)
        } catch {
            setUpload(.failed("Couldn't upload this photo."), for: sha256)
        }
    }

    private func setUpload(_ upload: InventoryFormPhoto.Upload, for sha256: String) {
        guard let index = draft.photos.firstIndex(where: { $0.sha256 == sha256 }) else { return }
        draft.photos[index].upload = upload
    }

    /// Shows, for every photo handed over, what the store reports for it.
    internal func followStoreUploads() {
        for index in draft.photos.indices where draft.photos[index].handedOver {
            guard draft.photos[index].upload != .attached,
                let reported = photoUploads[draft.photos[index].sha256]
            else { continue }
            draft.photos[index].upload = Self.upload(reported)
        }
    }

    private static func upload(_ reported: InventoryPhotoUpload) -> InventoryFormPhoto.Upload {
        switch reported {
        case .waiting: .waiting
        case .uploading: .uploading
        case .uploaded: .uploaded
        case .failed(let failure): .failed(InventoryCopy.message(for: failure))
        }
    }

    /// Shows `photoRunner`'s failure through the form's own alert, so a
    /// photo removal or reorder failure reads no differently from any other
    /// write in this form.
    private func adoptPhotoRunnerFailure() {
        guard let reported = photoRunner.failure else { return }
        photoRunner.failure = nil
        failure = reported
    }
}
