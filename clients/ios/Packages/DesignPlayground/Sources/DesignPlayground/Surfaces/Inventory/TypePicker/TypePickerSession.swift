import Foundation
import Observation

internal struct TypePickerSavedItem: Identifiable, Hashable {
    internal let id: UUID
    internal let name: String
    internal let typeID: String?
    internal let photoCount: Int
    internal let location: String
}

internal enum TypePickerPhotoSuggestion: Equatable {
    case idle
    case analysing
    case suggested
    case unavailable
    case dismissed
}

@Observable
@MainActor
internal final class TypePickerSession {
    internal var name: String
    internal var typeID: String? {
        didSet {
            guard typeID != nil, photoSuggestion != .idle else { return }
            photoRequestID = nil
            photoSuggestion = .dismissed
        }
    }
    internal var photoCount: Int
    internal private(set) var saved: [TypePickerSavedItem]
    internal private(set) var recentTypeIDs: [String]
    internal var location: String
    internal private(set) var photoSuggestion: TypePickerPhotoSuggestion
    internal private(set) var photoRequestID: UUID?

    internal init(
        name: String = "",
        typeID: String? = nil,
        photoCount: Int = 0,
        saved: [TypePickerSavedItem] = [],
        recentTypeIDs: [String] = [],
        location: String = "Living room"
    ) {
        self.name = name
        self.typeID = typeID
        self.photoCount = photoCount
        self.saved = saved
        self.recentTypeIDs = recentTypeIDs
        self.location = location
        self.photoSuggestion = .idle
        self.photoRequestID = nil
    }

    @discardableResult
    internal func save(keepingType: Bool = false) -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return false }

        saved.append(
            TypePickerSavedItem(
                id: UUID(),
                name: trimmedName,
                typeID: typeID,
                photoCount: photoCount,
                location: location
            ))
        if let typeID {
            recentTypeIDs.removeAll { $0 == typeID }
            recentTypeIDs.insert(typeID, at: 0)
        }
        let savedTypeID = typeID
        resetDraft()
        if keepingType { typeID = savedTypeID }
        return true
    }

    internal func capturePhoto() {
        let isFirstPhoto = photoCount == 0
        photoCount += 1
        guard isFirstPhoto, typeID == nil else { return }

        photoRequestID = UUID()
        photoSuggestion = .analysing
    }

    internal func completePhotoSuggestion(requestID: UUID, available: Bool) {
        guard
            photoRequestID == requestID,
            photoCount > 0,
            typeID == nil,
            photoSuggestion == .analysing
        else { return }

        photoRequestID = nil
        photoSuggestion = available ? .suggested : .unavailable
    }

    internal func dismissPhotoSuggestion() {
        photoRequestID = nil
        photoSuggestion = .dismissed
    }

    internal func removeLastPhoto() {
        guard photoCount > 0 else { return }

        photoCount -= 1
        guard photoCount == 0 else { return }

        photoRequestID = nil
        photoSuggestion = .idle
    }

    internal func startRelated(_ id: String) {
        typeID = id
    }

    internal func clearRecentTypes() {
        recentTypeIDs.removeAll()
    }

    internal func resetDraft() {
        name = ""
        typeID = nil
        photoCount = 0
        photoRequestID = nil
        photoSuggestion = .idle
    }
}
