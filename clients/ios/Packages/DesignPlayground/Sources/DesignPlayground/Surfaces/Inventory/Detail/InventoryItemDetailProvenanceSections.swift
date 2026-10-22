import DesignSystem
import SwiftUI

/// Merchant, price, receipt and warranty. Absent entirely when nothing is
/// recorded: a section that exists to say "not recorded" is a section a sparse
/// item's page is made of.
internal struct InventoryItemDetailProvenanceSection: View {
    internal let provenance: InventoryProvenance?

    @ViewBuilder internal var body: some View {
        if let provenance {
            InventoryItemDetailGroup("Provenance") {
                InventoryPropertyLine(key: "Merchant", value: provenance.merchant)
                InventoryPropertyLine(key: "Price", value: provenance.price)
                InventoryPropertyLine(key: "Purchased", value: provenance.purchasedOn)
                InventoryPropertyLine(
                    key: "Receipt", value: provenance.hasReceipt ? "On file" : "Not on file")
                if let warranty = provenance.warranty {
                    InventoryPropertyLine(key: "Warranty", value: warranty)
                }
            }
        }
    }
}

/// Linked documents, uploads still processing or refused, and Add document,
/// or the reason the store cannot show them, distinct from there being none:
/// missing Paperless is a state of the store, not of the item, and it takes
/// Add away because an upload could not land.
internal struct InventoryItemDetailDocumentsSection: View {
    internal let documents: InventoryDocuments

    internal var body: some View {
        InventoryItemDetailGroup("Documents") {
            switch documents {
            case .linked(let lines):
                ForEach(lines) { InventoryDocumentLineView(line: $0) }
                addMenu
            case .none:
                addMenu
            case .paperlessUnavailable:
                InventoryItemDetailNotice(tone: .warning, text: "Paperless unavailable") {
                    InventoryItemDetailRetryButton()
                }
            }
        }
    }

    private var addMenu: some View {
        Menu {
            Button("Choose File", systemImage: "folder") {}
            Button("Scan", systemImage: "doc.viewfinder") {}
            Button("Photo Library", systemImage: "photo.on.rectangle") {}
        } label: {
            Label("Add document", systemImage: "doc.badge.plus")
                .font(.popsBody)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsInventory)
    }
}

/// One document row: the kind's glyph, the name, and a second line only when
/// the document is not simply there to open.
private struct InventoryDocumentLineView: View {
    let line: InventoryDocumentLine

    var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: symbol).foregroundStyle(tint)
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                Text(line.title)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                if let detail {
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(
                            isFailed ? Color.popsDestructive : Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            if line.status == .linked {
                InventoryItemDetailDisclosure()
            }
        }
        .contextMenu {
            if line.status == .linked || line.status == .missing {
                Button("Rename", systemImage: "pencil") {}
                Menu("Kind", systemImage: "tag") {
                    Button("Receipt", systemImage: "receipt") {}
                    Button("Warranty", systemImage: "checkmark.seal") {}
                    Button("Manual", systemImage: "book.closed") {}
                    Button("Invoice", systemImage: "doc.plaintext") {}
                    Button("Document", systemImage: "doc") {}
                }
                Divider()
                Button("Unlink", systemImage: "minus.circle", role: .destructive) {}
            } else if isFailed {
                Button("Dismiss", systemImage: "xmark.circle") {}
            }
        }
    }

    private var isFailed: Bool {
        if case .failed = line.status { true } else { false }
    }

    private var symbol: String {
        switch line.status {
        case .linked: line.symbol
        case .missing: "exclamationmark.triangle"
        case .processing: "clock"
        case .failed: "exclamationmark.circle.fill"
        }
    }

    private var tint: Color {
        switch line.status {
        case .linked, .processing: .popsMutedForeground
        case .missing: .popsWarning
        case .failed: .popsDestructive
        }
    }

    private var detail: String? {
        switch line.status {
        case .linked: nil
        case .missing: "Missing from Paperless"
        case .processing: "Processing"
        case .failed(let reason): reason
        }
    }
}

/// What happened to this item, most recent first, one line each, in the ADR's
/// verbs. A line opens its account as a sheet; past the first three, the
/// last line opens the whole History page.
internal struct InventoryItemDetailHistorySection: View {
    private static var shownCount: Int { 3 }

    internal let name: String
    internal let activity: [InventoryActivityEntry]
    @State private var viewing: InventoryActivityEntry?

    @ViewBuilder internal var body: some View {
        if !activity.isEmpty {
            PopsQuietDisclosure("History") {
                ForEach(activity.prefix(Self.shownCount)) { entry in
                    Button {
                        viewing = entry
                    } label: {
                        PopsQuietDetailLine(entry.title, trailing: entry.when)
                    }
                    .buttonStyle(.plain)
                }
                if activity.count > Self.shownCount {
                    NavigationLink(
                        value: InventoryItemHistoryRoute(name: name, entries: activity)
                    ) {
                        PopsQuietDetailLine("All history", trailing: "\(activity.count)")
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .sheet(item: $viewing) { entry in
                InventoryHistoryEventSheet(entry: entry)
            }
        }
    }
}
