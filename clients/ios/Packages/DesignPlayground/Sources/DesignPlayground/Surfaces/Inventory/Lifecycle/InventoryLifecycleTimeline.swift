import DesignSystem
import SwiftUI

/// The movement/lifecycle timeline, in whichever depth
/// ``InventoryLifecycleStyle/TimelineDetail`` says a history is read at.
///
/// One list either way. `drillIn` differs only in that a row is a
/// `NavigationLink` rather than plain content, because the question is how
/// much a reader has to ask for, not how the list is laid out.
internal struct InventoryLifecycleTimelineList: View {
    internal let events: [InventoryTimelineEvent]
    @Environment(\.inventoryLifecycleStyle) private var style

    internal var body: some View {
        List(events) { event in
            switch style.timelineDetail {
            case .compact:
                InventoryLifecycleTimelineRow(event: event)
            case .drillIn:
                NavigationLink {
                    InventoryLifecycleEventDetail(event: event)
                } label: {
                    InventoryLifecycleTimelineRow(event: event)
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// The compact row both treatments show. A ``InventoryActivityRow`` plus
/// the one glyph that says whether this event undid an earlier one.
internal struct InventoryLifecycleTimelineRow: View {
    internal let event: InventoryTimelineEvent

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            InventoryActivityRow(
                verb: event.verb, subject: event.subject, detail: event.detail, when: event.when)
            if event.isReversal {
                Image(systemName: InventorySymbol.restore.system)
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsInventory)
                    .accessibilityLabel("Undoes an earlier change")
            }
        }
    }
}

/// What a drill-in opens into: the same event, in full.
internal struct InventoryLifecycleEventDetail: View {
    internal let event: InventoryTimelineEvent

    internal var body: some View {
        List {
            Section("What happened") {
                Text(event.fullDetail)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
            Section("When") {
                Text(event.when)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("\(event.verb) \(event.subject)")
    }
}
