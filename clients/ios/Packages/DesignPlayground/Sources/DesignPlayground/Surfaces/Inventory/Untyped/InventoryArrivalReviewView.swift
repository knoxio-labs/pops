import DesignSystem
import SwiftUI

/// The batch review: three candidates, each accepted or skipped on its own.
///
/// Per item rather than one Accept all, because the match is a guess made from
/// words and one of the three was matched through its note. A control that
/// takes all three on one tap is a control that makes the wrong one invisible.
internal struct InventoryArrivalBatchView: View {
    private let type = InventoryUntypedFixtures.bagType
    @State private var accepted: Set<String> = ["untyped", "sleeping-bag"]

    private var covered: [InventoryUntypedItem] {
        InventoryTypeArrival.covered(by: type, in: InventoryUntypedFixtures.all)
    }

    internal var body: some View {
        List {
            Section {
                ForEach(type.fieldNames, id: \.self) { field in
                    Text(field)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                }
            } header: {
                Text("\(type.name) asks for")
            } footer: {
                Text("Accepting fills none of these in. It gives the item the questions.")
            }
            Section {
                ForEach(covered) { entry in
                    InventoryArrivalCandidateRow(
                        entry: entry, isAccepted: binding(for: entry.id))
                }
            } header: {
                Text("\(accepted.count) of \(covered.count) accepted")
            } footer: {
                Text("A skipped item stays waiting and is not offered this type again.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { accepted.contains(id) },
            set: { isOn in
                if isOn {
                    accepted.insert(id)
                } else {
                    accepted.remove(id)
                }
            })
    }
}

/// One candidate, with the words that matched it said out loud.
///
/// Why it matched is the thing a reviewer needs and the thing a list of names
/// cannot give: the tripod is here because of one word in its note, and a
/// person deciding about it without that is guessing.
internal struct InventoryArrivalCandidateRow: View {
    internal let entry: InventoryUntypedItem
    @Binding internal var isAccepted: Bool

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryItemRow(item: entry.item)
            Text(entry.note)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2)
            Toggle("Give it the Bag type", isOn: $isAccepted)
                .font(.popsSubheadline)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

/// What the review left behind.
///
/// Both halves, because the useful number after a batch is not how many were
/// accepted but how many are still waiting, and a screen that reports only the
/// first reads as finished when it is not.
internal struct InventoryArrivalAppliedView: View {
    private var remaining: [InventoryUntypedItem] {
        InventoryWaitingQueue.remaining(
            in: InventoryUntypedFixtures.all, accepted: ["untyped", "sleeping-bag"])
    }

    internal var body: some View {
        List {
            Section {
                PopsStatusHeader(
                    tone: .success, title: "Two on the Bag type",
                    message:
                        "The camera tripod was skipped and stays waiting. Nothing was filled in: "
                        + "each of the two now has four empty fields.",
                    caption: "\(remaining.count) still waiting for a type")
            }
            Section {
                ForEach(remaining.prefix(4)) { InventoryUntypedRow(entry: $0) }
            } header: {
                Text("Still waiting · \(remaining.count)")
            } footer: {
                InventoryTypeSourceNote()
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}
