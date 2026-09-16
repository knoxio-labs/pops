import DesignSystem
import SwiftUI

/// Variant 4's two payoffs: a search that offers the template's fields first
/// and the catalogue's custom keys after, and a comparison that lines up on
/// the shared vocabulary without pretending the custom keys are not there.
internal struct InventoryHybridFindingView: View {
    internal let things: [InventoryThing]
    internal let clauses: [InventoryPropertyClause]

    internal var body: some View {
        let matches = clauses.matching(things)
        return List {
            Section {
                ForEach(clauses) { clause in
                    InventoryPropertyLine(
                        key: clause.key,
                        value: "\(clause.comparison.rawValue) \(clause.value)"
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
                    "Template fields are offered first because they are the ones every cable has; "
                        + "custom keys follow, with how many items use each.")
            }
            Section {
                ForEach(matches) { InventoryMatchRow(thing: $0, clauses: clauses) }
            } header: {
                InventoryQuerySummary(clauses: clauses, matches: matches.count)
            }
        }
        .playgroundInsetGroupedList()
    }
}

internal struct InventoryHybridComparisonView: View {
    internal let things: [InventoryThing]

    internal var body: some View {
        List {
            Section {
                InventoryComparisonGrid(things: things)
            } header: {
                Text("Both are cables")
            } footer: {
                Text(
                    "Template fields line up. A custom key only one of them has would show as a "
                        + "row with one gap.")
            }
        }
        .playgroundInsetGroupedList()
    }
}
