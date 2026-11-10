import Foundation

/// The safe name used for a downloaded file. QuickLook picks a previewer from
/// the extension, so a name without one gets the content type's.
public enum DocumentFileName {
    /// Uses the supplied safe basename and recorded MIME type without inventing a file type.
    public static func name(for version: DocumentFileMetadata, id: Int) -> String {
        let named = version.fileName.map(sanitised) ?? ""
        let base = named.isEmpty ? "document-\(id)" : named
        guard (base as NSString).pathExtension.isEmpty,
            let ext = version.contentType.flatMap(fileExtension(forMimeType:))
        else { return base }
        return "\(base).\(ext)"
    }

    private static func sanitised(_ name: String) -> String {
        let last = (name as NSString).lastPathComponent
        return last.replacing("/", with: "-").trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
    }

    private static func fileExtension(forMimeType mimeType: String) -> String? {
        let type = mimeType.split(separator: ";").first.map {
            $0.trimmingCharacters(in: .whitespaces).lowercased()
        }
        switch type {
        case "application/pdf": return "pdf"
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/heic": return "heic"
        case "image/gif": return "gif"
        case "image/tiff": return "tiff"
        case "image/webp": return "webp"
        case "text/plain": return "txt"
        case "text/csv": return "csv"
        case "text/html": return "html"
        default: return nil
        }
    }
}
