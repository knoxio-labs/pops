import AppCore
import Foundation

/// One photograph on the draft: already on the record, or captured this
/// session and somewhere on its way to being.
///
/// `attached` is the only state an edit's starting photos ever carry — the
/// server already has the bytes and the reference, so nothing here re-sends
/// either. Every other case belongs to a photo captured while this form is
/// open, before its `item.attachPhoto` is ever sent (deferred to the final
/// action, alongside the create or edit commands, per ``InventoryItemFormSubmission``).
internal struct InventoryFormPhoto: Identifiable, Hashable, Sendable {
    internal enum Upload: Hashable, Sendable {
        case attached
        case uploading
        case uploaded
        case failed(String)
    }

    internal let sha256: String
    internal var caption: String?
    internal var upload: Upload

    internal init(sha256: String, caption: String? = nil, upload: Upload) {
        self.sha256 = sha256
        self.caption = caption
        self.upload = upload
    }

    internal init(_ reference: InventoryPhotoReference) {
        sha256 = reference.sha256
        caption = reference.caption
        upload = .attached
    }

    internal var id: String { sha256 }

    internal var reference: InventoryPhotoReference {
        InventoryPhotoReference(sha256: sha256, caption: caption)
    }

    /// Whether this photo failed its upload and is asking for Retry or
    /// Remove rather than sitting quietly.
    internal var hasFailed: Bool {
        if case .failed = upload { return true }
        return false
    }
}

extension Array where Element == InventoryFormPhoto {
    /// Every photo whose bytes reached the server this session and are
    /// waiting for their `item.attachPhoto`, in strip order.
    internal var readyToAttach: [InventoryFormPhoto] {
        filter { $0.upload == .uploaded }
    }

    internal func removing(sha256: String) -> [InventoryFormPhoto] {
        filter { $0.sha256 != sha256 }
    }
}
