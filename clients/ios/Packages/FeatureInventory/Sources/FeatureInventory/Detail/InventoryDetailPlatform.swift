import SwiftUI

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// Several pieces of glass that belong to one control, so iOS renders them
/// as a family that merges as they approach rather than as unrelated blobs.
/// The host toolchain has no glass container and draws the content alone.
///
/// Kept beside `InventoryPlatform.swift`'s conditionals rather than in it
/// while that file is shared with the screens being moved in parallel.
internal struct InventoryGlassGroup<Content: View>: View {
    internal let spacing: CGFloat
    @ViewBuilder internal let content: Content

    internal var body: some View {
        #if os(iOS)
            GlassEffectContainer(spacing: spacing) { content }
        #else
            content
        #endif
    }
}

extension View {
    /// iOS 26's glass button style, and the bordered style where it does not
    /// exist.
    @ViewBuilder
    internal func inventoryGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glass)
        #else
            buttonStyle(.bordered)
        #endif
    }

    /// The inset-grouped list style, which is iOS-only.
    @ViewBuilder
    internal func inventoryInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }
}

/// Puts a string on the system pasteboard.
@MainActor
internal enum InventoryPasteboard {
    internal static func copy(_ text: String) {
        #if canImport(UIKit)
            UIPasteboard.general.string = text
        #elseif canImport(AppKit)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}
