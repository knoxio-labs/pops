import DesignSystem
import Foundation
import SwiftUI

/// Where an added document comes from.
internal enum InventoryDocumentSource: String, Identifiable {
    case file
    case scan
    case library

    internal var id: String { rawValue }

    /// Whether this device has a camera to scan with.
    @MainActor internal static var canScan: Bool {
        #if canImport(UIKit) && canImport(VisionKit)
            InventoryCameraAvailability.isAvailable
        #else
            false
        #endif
    }
}

/// Turns what a picker hands back into a file this app owns, under
/// `tmp/inventory-uploads/<uuid>/`, so the upload can stream it after the
/// picker is gone and nothing is held in memory but a photo's own bytes.
internal enum InventoryDocumentStaging {
    /// A copy of a picked file, read inside its security scope.
    internal static func copy(_ url: URL) -> InventoryPickedDocument? {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        guard let destination = destination(named: url.lastPathComponent) else { return nil }
        do {
            try FileManager.default.copyItem(at: url, to: destination)
            return try InventoryPickedDocument.describe(destination)
        } catch {
            return nil
        }
    }

    internal static func write(_ data: Data, named name: String) -> InventoryPickedDocument? {
        guard let destination = destination(named: name) else { return nil }
        do {
            try data.write(to: destination)
            return try InventoryPickedDocument.describe(destination)
        } catch {
            return nil
        }
    }

    internal static func destination(named name: String) -> URL? {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "inventory-uploads").appending(path: UUID().uuidString)
        do {
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return directory.appending(path: name)
    }
}

#if canImport(UIKit)

    import UIKit
    import UniformTypeIdentifiers

    extension InventoryDocumentStaging {
        /// A scan's pages as one PDF, each page sized to its image, written
        /// straight to disk.
        internal static func pdf(_ pages: [UIImage]) -> InventoryPickedDocument? {
            guard let first = pages.first,
                let destination = destination(named: "Scan.pdf")
            else { return nil }
            let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: first.size))
            do {
                try renderer.writePDF(to: destination) { context in
                    for page in pages {
                        let bounds = CGRect(origin: .zero, size: page.size)
                        context.beginPage(withBounds: bounds, pageInfo: [:])
                        page.draw(in: bounds)
                    }
                }
                return try InventoryPickedDocument.describe(destination)
            } catch {
                return nil
            }
        }
    }

    /// Presents each source and hands back the staged file once the picker
    /// has gone, so the kind-and-title sheet never collides with it.
    private struct InventoryDocumentSourcesModifier: ViewModifier {
        @Binding var source: InventoryDocumentSource?
        let onPicked: (InventoryPickedDocument) -> Void
        @State private var picked: InventoryPickedDocument?

        func body(content: Content) -> some View {
            content
                .sheet(item: sheetSource, onDismiss: deliver) { source in
                    switch source {
                    case .library:
                        InventoryLibraryPhotoPicker(selectionLimit: 1) { photos in
                            picked = photos.first.flatMap {
                                InventoryDocumentStaging.write($0, named: "Photo.jpg")
                            }
                            self.source = nil
                        }
                        .ignoresSafeArea()
                    case .file, .scan:
                        PopsDocumentPicker(
                            contentTypes: [.pdf, .image, .text], allowsMultipleSelection: false,
                            onPicked: { urls in
                                picked = urls.first.flatMap(InventoryDocumentStaging.copy)
                                self.source = nil
                            },
                            onCancel: { self.source = nil })
                    }
                }
                .modifier(ScanCover(source: $source, picked: $picked, deliver: deliver))
        }

        private var sheetSource: Binding<InventoryDocumentSource?> {
            Binding(
                get: { source == .scan ? nil : source },
                set: { if $0 == nil, source != .scan { source = nil } })
        }

        private func deliver() {
            guard let document = picked else { return }
            picked = nil
            onPicked(document)
        }
    }

    private struct ScanCover: ViewModifier {
        @Binding var source: InventoryDocumentSource?
        @Binding var picked: InventoryPickedDocument?
        let deliver: () -> Void

        func body(content: Content) -> some View {
            #if canImport(VisionKit)
                content.fullScreenCover(
                    isPresented: Binding(
                        get: { source == .scan }, set: { if !$0 { source = nil } }),
                    onDismiss: deliver
                ) {
                    PopsDocumentCamera(
                        onScan: { pages in
                            picked = InventoryDocumentStaging.pdf(pages)
                            source = nil
                        },
                        onCancel: { source = nil },
                        onFailure: { source = nil }
                    )
                    .ignoresSafeArea()
                }
            #else
                content
            #endif
        }
    }

    extension View {
        internal func inventoryDocumentSources(
            _ source: Binding<InventoryDocumentSource?>,
            onPicked: @escaping (InventoryPickedDocument) -> Void
        ) -> some View {
            modifier(InventoryDocumentSourcesModifier(source: source, onPicked: onPicked))
        }
    }

#else

    extension View {
        internal func inventoryDocumentSources(
            _ source: Binding<InventoryDocumentSource?>,
            onPicked: @escaping (InventoryPickedDocument) -> Void
        ) -> some View {
            self
        }
    }

#endif
