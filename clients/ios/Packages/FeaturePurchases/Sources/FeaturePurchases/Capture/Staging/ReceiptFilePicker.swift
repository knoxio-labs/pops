#if canImport(UIKit)

    import DesignSystem
    import Foundation
    import SwiftUI
    import UniformTypeIdentifiers

    internal struct ReceiptPickedFile: Hashable, Sendable {
        internal let url: URL
        internal let label: String
        internal let data: Data
    }

    /// The system file picker, reading each chosen receipt file into memory.
    internal struct ReceiptFilePicker: View {
        internal let onPicked: @MainActor @Sendable ([ReceiptPickedFile]) -> Void
        internal let onCancel: @MainActor @Sendable () -> Void

        internal var body: some View {
            PopsDocumentPicker(
                contentTypes: ReceiptStagingConversion.fileContentTypes,
                allowsMultipleSelection: true,
                onPicked: { [onPicked] urls in onPicked(urls.compactMap(Self.read)) },
                onCancel: onCancel)
        }

        /// Reads while the delegate still owns the picker-granted security scope.
        ///
        /// `asCopy` does not guarantee an unscoped URL. Deferring the matching stop until after
        /// `Data(contentsOf:)` keeps the access valid for the only read this picker performs.
        private static func read(_ url: URL) -> ReceiptPickedFile? {
            let accessed = url.startAccessingSecurityScopedResource()
            defer {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
            guard let data = try? Data(contentsOf: url) else { return nil }
            return ReceiptPickedFile(url: url, label: url.lastPathComponent, data: data)
        }
    }

#endif
