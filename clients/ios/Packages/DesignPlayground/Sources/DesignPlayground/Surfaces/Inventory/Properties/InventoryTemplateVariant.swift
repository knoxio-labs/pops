import DesignSystem
import SwiftUI

/// Variant 1 — category-specific structured templates.
///
/// A category owns a fixed set of fields and an object has exactly those. The
/// argument for it is that every cable then answers the same questions in the
/// same words, so comparing and searching them is arithmetic rather than
/// interpretation. The argument against it is everything that is not a cable:
/// a custom fact has nowhere to go, an uncategorised object has nothing to
/// show, and a category nobody wrote a template for is a dead end. Both are
/// drawn here rather than argued about.
internal struct InventoryTemplateVariantView: View {
    internal let step: InventoryPropertyStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .detail(let thing): detail(thing)
        case .create(let thing, let inferring): create(thing, inferring: inferring)
        case .edit(let thing): edit(thing)
        case .search(let things, let clauses):
            InventoryTemplateFindingView(things: things, clauses: clauses)
        case .swap(let thing, let template):
            InventoryTemplateSwapView(thing: thing, template: template)
        case .compare(let things):
            InventoryTemplateComparisonView(things: things)
        }
    }

    private func detail(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            if let template = thing.template {
                fields(of: template, on: thing)
            } else {
                noTemplate(thing)
            }
            unclaimed(thing)
        }
        .playgroundInsetGroupedList()
    }

    private func fields(of template: InventoryTemplate, on thing: InventoryThing) -> some View {
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
            Text(template.name)
        } footer: {
            Text(
                "These fields are what search can reach. Every \(template.name.lowercased()) has the same ones."
            )
        }
    }

    private func noTemplate(_ thing: InventoryThing) -> some View {
        Section {
            Button {
            } label: {
                Label("Choose a category", systemImage: "square.grid.2x2")
            }
        } header: {
            Text(thing.category)
        } footer: {
            Text(
                "\(thing.category) has no template, so there is nothing structured to show and "
                    + "nothing to search on. Everything known about it is in the note below.")
        }
    }

    /// Facts the template did not ask for. This variant has no field for them,
    /// so they end up in prose — which is the whole cost of the approach, and
    /// is shown rather than quietly dropped.
    @ViewBuilder
    private func unclaimed(_ thing: InventoryThing) -> some View {
        let strays = thing.custom + thing.properties.filter { $0.origin == .legacy }
        if !strays.isEmpty || !thing.notes.isEmpty {
            Section {
                Text(noteText(thing, strays: strays))
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            } header: {
                Text("Note")
            } footer: {
                if !strays.isEmpty {
                    Text("Text, not fields: a note is not searchable by value.")
                }
            }
        }
    }

    private func noteText(_ thing: InventoryThing, strays: [InventoryProperty]) -> String {
        let extras = strays.map { "\($0.key): \($0.value.display)" }
        return ([thing.notes] + extras).filter { !$0.isEmpty }.joined(separator: "\n")
    }

    private func create(_ thing: InventoryThing, inferring: Bool) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                InventoryPropertyLine(key: "Category", value: thing.category)
            } footer: {
                Text(
                    "The category is picked first. It decides which fields the rest of this screen has."
                )
            }
            if let template = thing.template {
                proposedFields(template, suggestions: thing.suggestions, inferring: inferring)
            }
        }
        .playgroundInsetGroupedList()
    }

    private func proposedFields(
        _ template: InventoryTemplate,
        suggestions: [InventoryProperty],
        inferring: Bool
    ) -> some View {
        Section {
            ForEach(template.fields) { field in
                if inferring,
                    let match = InventoryPropertySchema.duplicate(of: field.key, in: suggestions)
                {
                    InventorySuggestionLine(property: match)
                } else {
                    InventoryPropertyLine(
                        key: field.key,
                        value: field.unit.map { "Empty · \($0)" } ?? "Empty",
                        footnote: field.hint,
                        tone: .popsMutedForeground
                    )
                }
            }
        } header: {
            Text(template.name)
        } footer: {
            Text(
                inferring
                    ? "Every proposal lands in a field that already existed, so accepting one is the same as typing it."
                    : "Nothing is being proposed — the photo could not be read. The fields are the same either way."
            )
        }
    }

    private func edit(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            if let template = thing.template { editableFields(template, on: thing) }
            Section {
                ForEach(thing.suggestions) { InventorySuggestionLine(property: $0) }
            } header: {
                Text("Still proposed")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func editableFields(_ template: InventoryTemplate, on thing: InventoryThing)
        -> some View
    {
        Section {
            ForEach(template.fields) { field in
                InventoryPropertyLine(
                    key: field.key,
                    value: InventoryComparison.value(of: field.key, in: thing) ?? "Empty",
                    footnote: field.unit.map { "In \($0)" },
                    tone: InventoryComparison.value(of: field.key, in: thing) == nil
                        ? .popsMutedForeground : .popsForeground
                )
            }
            InventoryPropertyProblem(
                message: "\"Cable length\" is not a field on Charger",
                resolution:
                    "This variant has no custom keys. It goes in the note, or the Charger template gains a field."
            )
            InventoryPropertyProblem(
                message: "Power is recorded in watts",
                resolution:
                    "The field owns its unit, so an entry in another one is converted rather than refused."
            )
        } header: {
            Text(template.name)
        }
    }
}
