import AppCore
import DesignSystem
import SwiftUI

internal struct SearchRecentsList: View {
    @Binding private var recents: [SearchRecent]
    private let scope: SearchScope
    private let onSelect: (SearchRecent) -> Void
    @State private var swiping: SearchRecent?

    private var shown: [SearchRecent] {
        recents.filter { $0.shows(in: scope) }
    }

    internal init(
        recents: Binding<[SearchRecent]>,
        scope: SearchScope,
        onSelect: @escaping (SearchRecent) -> Void
    ) {
        _recents = recents
        self.scope = scope
        self.onSelect = onSelect
    }

    internal var body: some View {
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                PopsSectionHeader(title: "Recent")
                PopsListPanel {
                    PopsDividedRows(rows: shown.map(RecentRow.init)) { row in
                        recentRow(row.recent)
                    }
                }
            }
            .popsGroundedSwipeActionsContainer()
            .popsMotion(value: shown)
            .transition(.opacity)
        }
    }

    private func recentRow(_ recent: SearchRecent) -> some View {
        Button {
            onSelect(recent)
        } label: {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(recent.query)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if case .pillar(let pillar) = recent.scope {
                    Image(systemName: pillar.symbol)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel("In \(pillar.title)")
                }
            }
            .padding(.vertical, PopsSpacing.sm)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .popsGroundedSwipeRow(isActive: swiping == recent)
        .popsGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { swiping = $0 ? recent : nil },
            actions: {
                Button(role: .destructive) {
                    recents.removeAll { $0 == recent }
                } label: {
                    Label("Remove", systemImage: "trash")
                }
            })
    }
}

private struct RecentRow: Identifiable {
    let recent: SearchRecent

    var id: String {
        let scope =
            switch recent.scope {
            case .all: "all"
            case .pillar(let pillar): pillar.id
            }
        return "\(scope):\(recent.query.lowercased())"
    }
}
