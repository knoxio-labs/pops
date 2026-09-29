import DesignSystem
import Foundation

internal enum InventoryPhotoViewerPresentation {
    internal static func initialIndex(
        _ opening: InventoryDetailPhoto, in photos: [InventoryDetailPhoto]
    ) -> Int {
        photos.firstIndex(of: opening) ?? 0
    }

    internal static func label(_ photo: InventoryDetailPhoto, index: Int) -> String {
        photo.caption.isEmpty ? "Photo \(index + 1)" : photo.caption
    }

    internal static func loadData(
        for photo: InventoryDetailPhoto, cachedData: Data?, load: @escaping InventoryPhotoLoader
    ) async -> Data? {
        let data: Data?
        if let cachedData {
            data = cachedData
        } else {
            data = await load(photo.sha256, .full)
        }
        return PopsPhoto.isDecodable(data) ? data : nil
    }
}
