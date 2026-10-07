import DesignSystem
import SwiftUI

internal enum GuestHistoryState: Hashable, Sendable {
    case loading
    case loaded([GuestHistoryEvent])
    case failed
}

/// The audit log, newest first: on one entry, or across an account. It is
/// read-only on the phone. A deletion can be undone, and the page says where.
internal struct GuestHistoryView: View {
    internal let scope: GuestHistoryScope
    internal let state: GuestHistoryState

    internal var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.popsBackground)
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            LoadingStateView(message: GuestHistoryCopy.loading)
        case .failed:
            ErrorStateView(
                message: GuestHistoryCopy.failed, retryTitle: GuestHistoryCopy.retry
            ) {}
        case .loaded(let events) where events.isEmpty:
            EmptyStateView(message: GuestHistoryCopy.empty)
        case .loaded(let events):
            log(events)
        }
    }

    private func log(_ events: [GuestHistoryEvent]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.md) {
                PopsListPanel {
                    PopsDividedRows(rows: events) { event in
                        GuestHistoryRow(event: event, scope: scope)
                    }
                }
                if !GuestHistoryEvent.awaitingRestore(in: events).isEmpty {
                    Text(GuestHistoryCopy.restoreElsewhere)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .padding(.horizontal, PopsSpacing.md)
                }
            }
            .padding(PopsSpacing.lg)
        }
    }
}

internal struct GuestHistoryRow: View {
    internal let event: GuestHistoryEvent
    internal let scope: GuestHistoryScope

    @ScaledMetric(relativeTo: .body) private var markWidth = PopsSize.touchTarget
    private let presentation = GuestPresentation()

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: GuestHistoryCopy.symbol(for: event.action))
                .font(.popsTitle)
                .foregroundStyle(markColor)
                .frame(width: markWidth)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(GuestHistoryCopy.headline(event, scope: scope))
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(presentation.moment(event.at))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(event.changes) { change in
                    Text("\(change.field): \(change.before) → \(change.after)")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, PopsSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var markColor: Color {
        event.action == .deleted ? .popsDestructive : .popsMutedForeground
    }
}
