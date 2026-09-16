import DesignSystem
import SwiftUI

/// One of the sections the disclosure experiment can push to its own
/// screen instead of expanding in place.
internal enum InventoryItemDetailRoute: Hashable {
    case provenance
    case documents
    case activity

    internal var title: String {
        switch self {
        case .provenance: "Provenance"
        case .documents: "Documents"
        case .activity: "Activity"
        }
    }
}

/// A row that pushes to its section's own screen, the drill-in variant's
/// whole difference from the inline one.
internal struct InventoryItemDetailDrillInRow: View {
    internal let route: InventoryItemDetailRoute
    internal let subtitle: String

    internal var body: some View {
        NavigationLink(value: route) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(route.title)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Text(subtitle)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}

/// The drill-in variant's whole optional-sections group: one row per
/// section, each pushing to its own screen. Rows for an empty section are
/// held back unless the hierarchy experiment is holding every section's
/// place.
internal struct InventoryItemDetailDrillInRows: View {
    internal let detail: InventoryItemDetail
    internal let showsEmptyPlaceholders: Bool

    internal var body: some View {
        Section("More about this item") {
            if detail.provenance != nil || showsEmptyPlaceholders {
                InventoryItemDetailDrillInRow(
                    route: .provenance, subtitle: detail.provenance?.merchant ?? "Not recorded")
            }
            if !documentsAreEmpty || showsEmptyPlaceholders {
                InventoryItemDetailDrillInRow(route: .documents, subtitle: documentsSubtitle)
            }
            InventoryItemDetailDrillInRow(route: .activity, subtitle: activitySubtitle)
        }
    }

    private var documentsAreEmpty: Bool {
        if case .none = detail.documents { return true }
        return false
    }

    private var documentsSubtitle: String {
        switch detail.documents {
        case .linked(let titles): "\(titles.count) linked"
        case .paperlessUnavailable: "Unavailable"
        case .none: "None"
        }
    }

    private var activitySubtitle: String {
        detail.activity.isEmpty ? "Nothing recorded yet" : "\(detail.activity.count) events"
    }
}

/// The screen a drill-in row opens onto: the same section, alone.
internal struct InventoryItemDetailDrillInDestination: View {
    internal let route: InventoryItemDetailRoute
    internal let detail: InventoryItemDetail

    internal var body: some View {
        List {
            switch route {
            case .provenance:
                InventoryItemDetailProvenanceSection(
                    provenance: detail.provenance, showsWhenEmpty: true)
            case .documents:
                InventoryItemDetailDocumentsSection(
                    documents: detail.documents, showsWhenEmpty: true)
            case .activity:
                InventoryItemDetailActivitySection(activity: detail.activity)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(route.title)
    }
}
