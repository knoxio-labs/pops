import DesignSystem
import SwiftUI

/// Variant 5's search: the conditions on offer are the keys the catalogue
/// actually uses, each with how many items use it, so a key nobody has
/// adopted is visibly a key nobody has adopted.
internal struct InventoryObservedFindingView: View {
    internal let things: [InventoryThing]
    internal let clauses: [InventoryPropertyClause]

    internal var body: some View {
        let matches = clauses.matching(things)
        return List {
            Section {
                ForEach(clauses) { clause in
                    InventoryPropertyLine(
                        key: clause.key,
                        value: "\(clause.comparison.rawValue) \(clause.value)",
                        footnote: adoption(of: clause.key)
                    )
                }
                Button {
                } label: {
                    Label("Add a condition", systemImage: "plus")
                }
            } header: {
                Text("Find")
            } footer: {
                Text(
                    "Every key is offered with its count, so a search built on one item's private "
                        + "vocabulary looks wrong while it is being written rather than after it returns "
                        + "nothing.")
            }
            Section {
                ForEach(matches) { InventoryMatchRow(thing: $0, clauses: clauses) }
            } header: {
                InventoryQuerySummary(clauses: clauses, matches: matches.count)
            }
        }
        .playgroundInsetGroupedList()
    }

    private func adoption(of key: String) -> String {
        let normalized = InventoryPropertySchema.normalized(key)
        let count = things.filter { thing in thing.properties.contains { $0.id == normalized } }
            .count
        return count == 1 ? "1 item uses this key" : "\(count) items use this key"
    }
}

/// Variant 5 has no type to swap, and unlike the key/value variant that is not
/// because nothing is typed, it is because the type is a reading of the
/// catalogue rather than a field on the object. Changing it means changing
/// what the object records, and the reading follows.
internal struct InventoryObservedSwapView: View {
    internal let thing: InventoryThing
    internal let template: InventoryTemplate

    internal var body: some View {
        let observed = InventoryObservation.observed(
            like: thing, in: InventoryPropertyFixtures.all)
        return List {
            Section {
                InventoryThingHeader(thing: thing)
                InventoryTypePicker(
                    label: "Reads as",
                    selection: template.name,
                    options: InventoryPropertyTemplates.all.map(\.name),
                    footnote: observed.map {
                        "Read as \($0.name) until now, because \($0.sampleCount) others with "
                            + "these keys are. Overriding that changes the reading, not the item."
                    }
                )
            }
            Section {
                ForEach(template.fields) { field in
                    InventoryPropertyLine(
                        key: field.key,
                        value: InventoryComparison.value(of: field.key, in: thing) ?? "Not set",
                        tone: InventoryComparison.value(of: field.key, in: thing) == nil
                            ? .popsMutedForeground : .popsForeground
                    )
                }
            } header: {
                Text("What a \(template.name.lowercased()) records here")
            } footer: {
                Text(
                    "Nothing moved and nothing was carried anywhere: the object still holds every key "
                        + "it held, and only the list it is being read against changed.")
            }
            Section {
                ForEach(thing.properties) {
                    InventoryPropertyLine(key: $0.key, value: $0.value.display)
                }
            } header: {
                Text("Still recorded · \(thing.properties.count)")
            } footer: {
                Text(
                    "Which is the argument for this variant and the case against it in one screen: "
                        + "a type change is free because a type was never load-bearing.")
            }
        }
        .playgroundInsetGroupedList()
    }
}
