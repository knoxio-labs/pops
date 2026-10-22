import AppCore
import DesignSystem
import SwiftUI

/// One document: its kind's glyph, its name, and a line when it is not
/// simply there to open.
internal struct InventoryDocumentRowView: View {
    let row: InventoryDocumentRow
    let note: String?
    let isOpening: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: PopsSpacing.sm) {
                glyph.image.foregroundStyle(glyphColor)
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                    Text(row.title)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                        .lineLimit(2)
                    if let detail {
                        Text(detail)
                            .font(.popsCaption)
                            .foregroundStyle(detailColor)
                    }
                }
                .modifier(OpeningShimmer(isOpening: isOpening))
                Spacer(minLength: PopsSpacing.sm)
                if isOpenable {
                    InventoryItemDetailDisclosure()
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!isOpenable || isOpening)
        .accessibilityIdentifier("inventory.documents.row")
    }

    private var isOpenable: Bool {
        if case .linked = row.status { true } else { false }
    }

    private var glyph: InventorySymbol {
        switch row.status {
        case .linked, .titleOnly: InventorySymbol.document(row.kind ?? .other)
        case .missing: .stale
        case .processing: .processing
        case .failed: .attention
        }
    }

    private var glyphColor: Color {
        switch row.status {
        case .linked, .titleOnly, .processing: .popsMutedForeground
        case .missing: .popsWarning
        case .failed: .popsDestructive
        }
    }

    private var detail: String? {
        if let note { return note }
        switch row.status {
        case .linked, .titleOnly: return nil
        case .missing: return InventoryDocumentCopy.missing
        case .processing: return InventoryDocumentCopy.processing
        case .failed(let ingestion): return ingestion.reason ?? InventoryDocumentCopy.failed
        }
    }

    private var detailColor: Color {
        if case .failed = row.status { .popsDestructive } else { .popsMutedForeground }
    }
}

/// The row shimmers while its file downloads, rather than showing a spinner.
private struct OpeningShimmer: ViewModifier {
    let isOpening: Bool

    func body(content: Content) -> some View {
        if isOpening { content.popsShimmer() } else { content }
    }
}
