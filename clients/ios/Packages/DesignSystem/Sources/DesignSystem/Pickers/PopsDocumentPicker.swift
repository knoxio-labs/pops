#if canImport(UIKit)

    import SwiftUI
    import UIKit
    import UniformTypeIdentifiers

    /// The system file picker, handing back copies of the chosen files.
    ///
    /// `asCopy` puts each file in this app's own container, so a caller may
    /// read it after the picker is gone. A copy can still arrive
    /// security-scoped, so a caller reading one brackets the read with
    /// `startAccessingSecurityScopedResource()`. Present it from a `.sheet`.
    public struct PopsDocumentPicker: UIViewControllerRepresentable {
        private let contentTypes: [UTType]
        private let allowsMultipleSelection: Bool
        private let onPicked: @MainActor @Sendable ([URL]) -> Void
        private let onCancel: @MainActor @Sendable () -> Void

        public init(
            contentTypes: [UTType],
            allowsMultipleSelection: Bool,
            onPicked: @escaping @MainActor @Sendable ([URL]) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void
        ) {
            self.contentTypes = contentTypes
            self.allowsMultipleSelection = allowsMultipleSelection
            self.onPicked = onPicked
            self.onCancel = onCancel
        }

        public func makeCoordinator() -> PopsDocumentPickerCoordinator {
            PopsDocumentPickerCoordinator(onPicked: onPicked, onCancel: onCancel)
        }

        public func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: contentTypes, asCopy: true)
            picker.allowsMultipleSelection = allowsMultipleSelection
            picker.delegate = context.coordinator
            return picker
        }

        public func updateUIViewController(
            _ controller: UIDocumentPickerViewController, context: Context
        ) {}
    }

    /// ``PopsDocumentPicker``'s delegate.
    @MainActor
    public final class PopsDocumentPickerCoordinator: NSObject, UIDocumentPickerDelegate {
        private let onPicked: @MainActor @Sendable ([URL]) -> Void
        private let onCancel: @MainActor @Sendable () -> Void

        internal init(
            onPicked: @escaping @MainActor @Sendable ([URL]) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void
        ) {
            self.onPicked = onPicked
            self.onCancel = onCancel
        }

        public nonisolated func documentPicker(
            _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
        ) {
            MainActor.assumeIsolated { onPicked(urls) }
        }

        public nonisolated func documentPickerWasCancelled(
            _ controller: UIDocumentPickerViewController
        ) {
            MainActor.assumeIsolated { onCancel() }
        }
    }

#endif
