import Foundation
import Observation

internal struct TypePickerSavedItem: Identifiable, Hashable {
    internal let id: UUID
    internal let name: String
    internal let typeID: String?
    internal let photoCount: Int
    internal let location: String
}

@Observable
@MainActor
internal final class TypePickerSession {
    internal var name: String
    internal var typeID: String?
    internal var photoCount: Int
    internal private(set) var saved: [TypePickerSavedItem]
    internal private(set) var recentTypeIDs: [String]
    internal var location: String

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
    }

    @discardableResult
    internal func save() -> Bool {
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
        resetDraft()
        return true
    }

    internal func capturePhoto() {
        photoCount += 1
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
    }
}
