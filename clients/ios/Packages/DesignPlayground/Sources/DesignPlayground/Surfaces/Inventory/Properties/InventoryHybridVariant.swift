import DesignSystem
import SwiftUI

/// Variant 4, a template that suggests, and custom properties that are
/// first-class.
///
/// The template is advice rather than a schema: it says which fields a cable
/// usually has, and an object may hold keys it never mentioned. So a cable
/// still compares with a cable, the sideboard is not an empty screen, and the
/// adapter's legacy key survives with its provenance rather than being
/// laundered into a normal row.
///
/// Its cost is that there are now two kinds of property on one screen, and the
/// reader has to be told which is which without being made to care. That is
/// the thing to look at here.
internal struct InventoryHybridVariantView: View {
    internal let step: InventoryPropertyStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .detail(let thing): detail(thing)
        case .create(let thing, let inferring): create(thing, inferring: inferring)
        case .edit(let thing): edit(thing)
        case .search(let things, let clauses):
            InventoryHybridFindingView(things: things, clauses: clauses)
        case .swap(let thing, let template):
            InventoryHybridSwapView(thing: thing, template: template)
        case .compare(let things):
            InventoryHybridComparisonView(things: things)
        }
    }

    private func detail(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            if let template = thing.template {
                templated(template, on: thing)
            } else {
                suggestTemplate(thing)
            }
            alsoRecorded(thing)
            if !thing.notes.isEmpty {
                Section {
                    Text(thing.notes).font(.popsBody)
                } header: {
                    Text("Note")
                }
            }
        }
        .playgroundInsetGroupedList()
    }

    private func templated(_ template: InventoryTemplate, on thing: InventoryThing) -> some View {
        Section {
            ForEach(template.fields) { field in
                if let value = InventoryComparison.value(of: field.key, in: thing) {
                    InventoryPropertyLine(key: field.key, value: value)
                }
            }
            let blank = InventoryTemplateChange(thing: thing, changingTo: template).blankFields
            ForEach(blank) { field in
                InventoryPropertyLine(key: field.key, value: "Not set", tone: .popsMutedForeground)
            }
        } header: {
            Text(template.name)
        } footer: {
            Text(
                "What a \(template.name.lowercased()) usually records. Nothing forces an object to have all of it."
            )
        }
    }

    private func suggestTemplate(_ thing: InventoryThing) -> some View {
        Section {
            Button {
            } label: {
                Label("Describe it as a charger", systemImage: "wand.and.sparkles")
            }
        } header: {
            Text(thing.category)
        } footer: {
            Text(
                "No template yet, and the screen still works. Choosing one adds fields; it never removes "
                    + "what is already here.")
        }
    }

    @ViewBuilder
    private func alsoRecorded(_ thing: InventoryThing) -> some View {
        let extras = thing.properties.filter { $0.origin == .custom || $0.origin == .legacy }
        if !extras.isEmpty {
            Section {
                ForEach(extras) { property in
                    InventoryPropertyLine(
                        key: property.key,
                        value: property.value.display,
                        footnote: property.origin == .legacy ? "From an older record" : nil
                    )
                }
                Button {
                } label: {
                    Label("Add a property", systemImage: "plus")
                }
            } header: {
                Text("Also recorded")
            } footer: {
                Text(
                    "Typed and searchable like any field. The heading is the only thing that marks it as custom."
                )
            }
        }
    }

    private func create(_ thing: InventoryThing, inferring: Bool) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                InventoryPropertyLine(
                    key: "Looks like",
                    value: thing.template?.name ?? "Nothing recognised",
                    footnote: origin(of: thing, inferring: inferring)
                )
            } header: {
                Text("Template")
            } footer: {
                Text(
                    "A template is offered, never required, and one exists here because other items "
                        + "already record these keys, not because somebody wrote it first.")
            }
            Section {
                if inferring {
                    ForEach(thing.suggestions) { InventorySuggestionLine(property: $0) }
                } else {
                    ForEach(thing.template?.fields ?? []) { field in
                        InventoryPropertyLine(
                            key: field.key,
                            value: "Empty",
                            footnote: field.hint,
                            tone: .popsMutedForeground
                        )
                    }
                }
            } header: {
                Text(inferring ? "Proposed" : "Fields")
            } footer: {
                Text(
                    inferring
                        ? "Accept them one at a time. Anything dismissed leaves the field empty rather than absent."
                        : "The template still knows which fields to offer, so the screen degrades to a form rather "
                            + "than to a blank.")
            }
        }
        .playgroundInsetGroupedList()
    }

    /// Where the offered template came from. The first review asked this of
    /// the variant and it had no answer: a template nobody can account for is
    /// one that has to be authored up front, which was the objection.
    private func origin(of thing: InventoryThing, inferring: Bool) -> String {
        let peers = InventoryObservation.cluster(like: thing, in: InventoryPropertyFixtures.all)
        if peers.count >= 2 {
            return "\(peers.count) other items here record these keys"
        }
        return inferring ? "From the name and the photo" : "Inference unavailable"
    }

    private func edit(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                ForEach(thing.accepted) {
                    InventoryPropertyLine(key: $0.key, value: $0.value.display)
                }
            } header: {
                Text(thing.template?.name ?? "Fields")
            }
            problems(on: thing)
            Section {
                ForEach(thing.suggestions) { InventorySuggestionLine(property: $0) }
            } header: {
                Text("Still proposed")
            } footer: {
                Text(
                    "Two accepted, two waiting. Leaving the screen keeps the two that were accepted."
                )
            }
        }
        .playgroundInsetGroupedList()
    }

    private func problems(on thing: InventoryThing) -> some View {
        let collision = InventoryPropertySchema.duplicate(
            of: InventoryPropertyFixtures.draftKey, in: thing.properties)
        return Section {
            ForEach(thing.custom) { property in
                InventoryPropertyLine(
                    key: property.key,
                    value: property.value.display,
                    tone: property.value.hasSupportedUnit ? .popsForeground : .popsWarning
                )
            }
            if let collision {
                InventoryPropertyProblem(
                    message: "\"\(InventoryPropertyFixtures.draftKey)\" is \"\(collision.key)\"",
                    resolution:
                        "Same key under a different spelling. Editing the existing one keeps the two in step."
                )
            }
            ForEach(InventoryPropertySchema.unsupportedUnits(in: thing.properties)) { property in
                InventoryPropertyProblem(
                    message: "\(property.value.unitSymbol ?? "") is not a unit the catalogue knows",
                    resolution:
                        "Offer the metric equivalent, or keep it as text and say it cannot be compared."
                )
            }
        } header: {
            Text("Also recorded")
        }
    }
}
