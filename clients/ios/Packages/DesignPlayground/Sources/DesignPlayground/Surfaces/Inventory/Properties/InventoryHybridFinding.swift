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
                        + "custom keys follow, with how many items use each — which is also how a "
                        + "custom key earns its way into the template.")
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

/// Variant 4's type change. The template is advice, so the values it does not
/// ask for keep their type and their place in search — they only lose the
/// heading they were sitting under.
internal struct InventoryHybridSwapView: View {
    internal let thing: InventoryThing
    internal let template: InventoryTemplate

    internal var body: some View {
        List {
            Section {
                InventoryThingHeader(thing: thing)
                InventoryTypePicker(
                    label: "Type",
                    selection: template.name,
                    options: InventoryPropertyTemplates.all.map(\.name) + ["No type"],
                    footnote: "Was \(thing.category). A type suggests fields; it never removes any."
                )
            }
            InventoryTemplateChangeSummary(
                change: InventoryTemplateChange(thing: thing, changingTo: template),
                carriedTitle: "Also recorded",
                carriedNote:
                    "\(template.name) does not ask for these. They keep their type and their unit, "
                    + "and a search can still reach them."
            )
        }
        .playgroundInsetGroupedList()
    }
}
