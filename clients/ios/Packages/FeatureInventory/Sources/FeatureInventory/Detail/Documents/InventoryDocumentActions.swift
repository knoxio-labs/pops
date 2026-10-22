import AppCore
import DesignSystem
import SwiftUI

/// Add document: a file, a scan when the device has a camera, or a photo.
internal struct InventoryDocumentAddMenu: View {
    @Binding internal var source: InventoryDocumentSource?

    internal var body: some View {
        Menu {
            Button {
                source = .file
            } label: {
                Label {
                    Text(InventoryDocumentCopy.chooseFile)
                } icon: {
                    InventorySymbol.chooseFile.image
                }
            }
            if InventoryDocumentSource.canScan {
                Button {
                    source = .scan
                } label: {
                    Label {
                        Text(InventoryDocumentCopy.scan)
                    } icon: {
                        InventorySymbol.scanDocument.image
                    }
                }
            }
            Button {
                source = .library
            } label: {
                Label {
                    Text(InventoryDocumentCopy.photoLibrary)
                } icon: {
                    InventorySymbol.library.image
                }
            }
        } label: {
            Label {
                Text(InventoryDocumentCopy.add)
            } icon: {
                InventorySymbol.addDocument.image
            }
            .font(.popsBody)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsInventory)
    }
}

/// A row's context menu: Rename, Kind and Unlink for a linked document,
/// Dismiss for an upload Paperless refused.
internal struct InventoryDocumentRowActions: View {
    internal let row: InventoryDocumentRow
    internal let model: InventoryItemDocumentsModel

    internal var body: some View {
        if let document = row.linkedDocument {
            Button {
                model.editing = document
            } label: {
                Label {
                    Text("Rename")
                } icon: {
                    InventorySymbol.rename.image
                }
            }
            kindPicker(document)
            Divider()
            Button(role: .destructive) {
                model.requestUnlink(document)
            } label: {
                Label {
                    Text("Unlink")
                } icon: {
                    InventorySymbol.unlink.image
                }
            }
        } else if case .failed(let ingestion) = row.status {
            Button {
                Task { await model.dismiss(ingestion) }
            } label: {
                Label {
                    Text("Dismiss")
                } icon: {
                    InventorySymbol.dismiss.image
                }
            }
        }
    }

    /// Changing the kind keeps the title, so the edit sends the kind alone.
    private func kindPicker(_ document: InventoryLinkedDocument) -> some View {
        Picker(
            selection: Binding(
                get: { document.kind },
                set: { kind in
                    Task { await model.edit(document, kind: kind, title: document.title ?? "") }
                })
        ) {
            ForEach(InventoryDocumentKind.allCases, id: \.self) { kind in
                Label {
                    Text(InventoryDocumentCopy.kindName(kind))
                } icon: {
                    InventorySymbol.document(kind).image
                }
                .tag(kind)
            }
        } label: {
            Label {
                Text("Kind")
            } icon: {
                InventorySymbol.documentKind.image
            }
        }
        .pickerStyle(.menu)
    }
}
