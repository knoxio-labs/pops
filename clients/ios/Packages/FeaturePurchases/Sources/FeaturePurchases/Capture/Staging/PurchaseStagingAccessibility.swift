internal enum PurchaseStagingAccessibility {
    internal static let root = "purchase-staging"
    internal static let read = "purchase-staging-read"
    internal static let cancel = "purchase-staging-cancel"
    internal static let add = "purchase-staging-add"
    internal static let looseWell = "purchase-staging-loose"
    internal static let viewerReplace = "purchase-staging-viewer-replace"
    internal static let viewerDelete = "purchase-staging-viewer-delete"
    internal static let viewerClose = "purchase-staging-viewer-close"

    internal static func tile(_ pageID: String) -> String {
        "purchase-staging-tile-\(pageID)"
    }
}
