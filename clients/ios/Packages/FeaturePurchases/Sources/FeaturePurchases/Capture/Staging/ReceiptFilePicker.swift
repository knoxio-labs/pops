#if canImport(UIKit)

    import Foundation
    import SwiftUI
    import UIKit
    import UniformTypeIdentifiers

    internal struct ReceiptPickedFile: Hashable, Sendable {
        internal let url: URL
        internal let label: String
        internal let data: Data
    }

    internal struct ReceiptFilePicker: UIViewControllerRepresentable {
        internal let onPicked: @MainActor @Sendable ([ReceiptPickedFile]) -> Void
        internal let onCancel: @MainActor @Sendable () -> Void

        internal func makeCoordinator() -> ReceiptFilePickerCoordinator {
            ReceiptFilePickerCoordinator(onPicked: onPicked, onCancel: onCancel)
        }

        internal func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [.jpeg, .png, .webP, .gif, .pdf, .plainText],
                asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = context.coordinator
            return picker
        }

        internal func updateUIViewController(
            _ controller: UIDocumentPickerViewController,
            context: Context
        ) {}
    }

    @MainActor
    internal final class ReceiptFilePickerCoordinator: NSObject, UIDocumentPickerDelegate {
        private let onPicked: @MainActor @Sendable ([ReceiptPickedFile]) -> Void
        private let onCancel: @MainActor @Sendable () -> Void

        internal init(
            onPicked: @escaping @MainActor @Sendable ([ReceiptPickedFile]) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void
        ) {
            self.onPicked = onPicked
            self.onCancel = onCancel
        }

        internal nonisolated func documentPicker(
            _ controller: UIDocumentPickerViewController,
            didPickDocumentsAt urls: [URL]
        ) {
            MainActor.assumeIsolated {
                onPicked(urls.compactMap(Self.read))
            }
        }

        internal nonisolated func documentPickerWasCancelled(
            _ controller: UIDocumentPickerViewController
        ) {
            MainActor.assumeIsolated { onCancel() }
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
