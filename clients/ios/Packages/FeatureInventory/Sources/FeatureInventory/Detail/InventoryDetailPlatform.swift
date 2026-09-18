import SwiftUI

#if canImport(UIKit)
    import UIKit
#endif

/// Puts a string on the system pasteboard. A no-op on the host toolchain,
/// which has no pasteboard this package ships against, the same call
/// `SystemSettings` makes for its own UIKit-only API.
@MainActor
internal enum InventoryPasteboard {
    internal static func copy(_ text: String) {
        #if canImport(UIKit)
            UIPasteboard.general.string = text
        #endif
    }
}
