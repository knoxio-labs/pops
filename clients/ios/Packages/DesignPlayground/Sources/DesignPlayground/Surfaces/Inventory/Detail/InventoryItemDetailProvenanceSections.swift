import DesignSystem
import SwiftUI

/// Merchant, price, receipt and warranty, or an explicit "not recorded"
/// when the hierarchy experiment holds every section's place.
internal struct InventoryItemDetailProvenanceSection: View {
    internal let provenance: InventoryProvenance?
    internal let showsWhenEmpty: Bool

    @ViewBuilder internal var body: some View {
        if let provenance {
            Section("Provenance") {
                InventoryPropertyLine(key: "Merchant", value: provenance.merchant)
                InventoryPropertyLine(key: "Price", value: provenance.price)
                InventoryPropertyLine(key: "Purchased", value: provenance.purchasedOn)
                InventoryPropertyLine(
                    key: "Receipt", value: provenance.hasReceipt ? "On file" : "Not on file")
                if let warranty = provenance.warranty {
                    InventoryPropertyLine(key: "Warranty", value: warranty)
                }
            }
        } else if showsWhenEmpty {
            Section("Provenance") {
                Text("Not recorded. No purchase is linked to this item.")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}

/// Linked documents, or the reason the store cannot show them, distinct from
/// there being none: missing Paperless is a state of the store, not of the
/// item.
internal struct InventoryItemDetailDocumentsSection: View {
    internal let documents: InventoryDocuments
    internal let showsWhenEmpty: Bool

    @ViewBuilder internal var body: some View {
        switch documents {
        case .linked(let titles):
            Section("Documents") {
                ForEach(titles, id: \.self) { title in
                    Label(title, systemImage: "doc.text")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                }
            }
        case .paperlessUnavailable:
            Section("Documents") {
                PopsStatusHeader(
                    tone: .warning, title: "Paperless isn't reachable",
                    message:
                        "This item may have linked documents. The document store did not answer.")
            }
        case .none:
            if showsWhenEmpty {
                Section("Documents") {
                    Text("No documents linked.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }
}

/// What a container-capable item holds, in one line. The container's own
/// contents are its own list; this only summarises it, per ADR-001.
internal struct InventoryItemDetailContainerSection: View {
    internal let summary: InventoryContainerSummary?

    @ViewBuilder internal var body: some View {
        if let summary {
            Section("Container") {
                InventoryPropertyLine(key: "Holds", value: contents(summary))
            }
        }
    }

    private func contents(_ summary: InventoryContainerSummary) -> String {
        summary.containerCount == 0
            ? "\(summary.itemCount) items"
            : "\(summary.itemCount) items · \(summary.containerCount) containers"
    }
}

/// What happened to this item, most recent first, in the ADR's verbs.
internal struct InventoryItemDetailActivitySection: View {
    internal let activity: [InventoryActivityEntry]

    @ViewBuilder internal var body: some View {
        Section("Activity") {
            if activity.isEmpty {
                Text("Nothing recorded yet.")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            } else {
                ForEach(activity) {
                    InventoryActivityRow(
                        verb: $0.verb, subject: $0.subject, detail: $0.detail, when: $0.when)
                }
            }
        }
    }
}
