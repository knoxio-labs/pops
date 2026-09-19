import AppCore
import Foundation

extension InventoryDrain {
    /// Uploads every staged photo waiting to go.
    ///
    /// - Returns: How the pass ends when an upload did not arrive; nil when
    ///   the pass can go on to its batch.
    func uploadStagedPhotos() async throws -> InventoryDrainPass? {
        for upload in try replica.uploadsToSend() {
            guard let data = try replica.stagedPhoto(upload.sha256) else {
                try replica.failUpload(upload.sha256, .bytesMissing)
                continue
            }
            try replica.markUploading(upload.sha256)
            do {
                _ = try await online.transport.uploadMedia(
                    sha256: upload.sha256, data: data, contentType: upload.contentType)
            } catch let refusal as InventorySyncTransportError
                where refusal == .mediaTooLarge || refusal == .mediaUnsupported
            {
                online.noteReached()
                try replica.failUpload(
                    upload.sha256, refusal == .mediaTooLarge ? .tooLarge : .unsupported)
                continue
            } catch {
                try replica.returnUpload(upload.sha256)
                online.noteFailure(error)
                return OnlineInventoryStore.blockReason(for: error) == nil ? .retryLater : .blocked
            }
            online.noteReached()
            try replica.markUploaded(upload.sha256)
        }
        return nil
    }
}
