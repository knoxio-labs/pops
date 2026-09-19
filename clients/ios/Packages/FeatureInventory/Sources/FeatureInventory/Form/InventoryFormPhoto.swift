import AppCore

/// One photograph on the draft: already on the record, or captured this
/// session and somewhere on its way to being.
///
/// `attached` is the only state an edit's starting photos ever carry — the
/// server already has the bytes and the reference, so nothing here re-sends
/// either. Every other case belongs to a photo captured while this form is
/// open, before its `item.attachPhoto` is ever sent (deferred to the final
/// action, alongside the create or edit commands, per ``InventoryItemFormSubmission``).
///
/// `handedOver` is set once the store has taken the bytes. A store that
/// uploads while the form waits has sent them by then; a local-first one has
/// staged them and uploads them ahead of the attach, reporting how far it got
/// through `InventoryQuery.photoUploads`, which then drives `upload`.
internal struct InventoryFormPhoto: Identifiable, Hashable, Sendable {
    internal enum Upload: Hashable, Sendable {
        case attached
        case uploading
        /// Staged on this phone, waiting for the network.
        case waiting
        case uploaded
        case failed(String)
    }

    internal let sha256: String
    internal var caption: String?
    internal var upload: Upload
    internal var handedOver: Bool

    internal init(
        sha256: String, caption: String? = nil, upload: Upload, handedOver: Bool = false
    ) {
        self.sha256 = sha256
        self.caption = caption
        self.upload = upload
        self.handedOver = handedOver
    }

    internal init(_ reference: InventoryPhotoReference) {
        sha256 = reference.sha256
        caption = reference.caption
        upload = .attached
        handedOver = true
    }

    internal var id: String { sha256 }

    /// Whether this photo failed its upload and is asking for Retry or
    /// Remove rather than sitting quietly.
    internal var hasFailed: Bool {
        if case .failed = upload { return true }
        return false
    }

    /// Whether the final action should send an `item.attachPhoto` for it:
    /// the store holds the bytes, nothing refused them, and it is not on the
    /// item already.
    internal var isReadyToAttach: Bool {
        handedOver && !hasFailed && upload != .attached
    }
}

/// Which way a photo already on the item moves among the others already on
/// it, per a tile's "Move earlier" and "Move later" menu items.
internal enum InventoryPhotoReorderDirection: Hashable, Sendable {
    case earlier
    case later
}

extension Array where Element == InventoryFormPhoto {
    internal func removing(sha256: String) -> [InventoryFormPhoto] {
        filter { $0.sha256 != sha256 }
    }

    /// The hashes of every attached photo, in strip order, with `sha256`
    /// swapped one step `direction`. Nil when `sha256` names no attached
    /// photo, or is already at that end.
    internal func reorderedAttachedIds(
        moving sha256: String, _ direction: InventoryPhotoReorderDirection
    ) -> [String]? {
        let attachedIds = compactMap { photo -> String? in
            guard case .attached = photo.upload else { return nil }
            return photo.sha256
        }
        guard let index = attachedIds.firstIndex(of: sha256) else { return nil }
        let target = direction == .earlier ? index - 1 : index + 1
        guard attachedIds.indices.contains(target) else { return nil }
        var reordered = attachedIds
        reordered.swapAt(index, target)
        return reordered
    }
}
